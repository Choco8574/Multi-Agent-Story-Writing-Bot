// Multi-Agent Story Writer
// This file implements three cooperating agents:
//  - Plot Planner: suggests story hooks and prompt ideas
//  - Character Designer: creates characters and motivations
//  - Narrator: composes the final story using the other agents' outputs

const agents = {
  planner: {
    name: 'Plot Planner',
    instruction: 'Create 4-5 child-friendly story idea suggestions or vivid scene hooks (short, whimsical lines) the user can select as their story prompt. Keep language simple and playful for ages 5-9.'
  },
  characters: {
    name: 'Character Designer',
    instruction: 'Describe 2-3 friendly characters suitable for a children\'s story: simple goals, clear traits, and a gentle conflict or problem that is age-appropriate.'
  },
  narrator: {
    name: 'Narrator',
    instruction: 'Write a warm, playful short story (approx. 350-600 words) suitable for children aged 5-9. The story should be 10-20 paragraphs long, have no cliffhangers, and end with a clear final paragraph labeled "The End.". Include a short moral labeled "Moral:" before the ending.'
  }
};

const endpoint = 'https://vibe-proxy-gqv4.onrender.com/v1/chat/completions';
const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer sk-vibe-summer-2026'
};

async function sendToProxy(messageContent) {
  const body = {
    model: 'class-chat-model',
    messages: [ { role: 'user', content: messageContent } ]
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Proxy request failed: ${res.status} ${res.statusText} - ${errorText}`);
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? '(no text returned)';
  } catch (err) {
    console.error('sendToProxy error', err);
    throw new Error(err.message ?? 'Unknown network error');
  }
}

const ideaContainer = document.getElementById('ideaSuggestions');
const ideaList = ideaContainer.querySelector('.ideaList');

function createAgentCard(label) {
  const results = document.getElementById('agentResults');
  const card = document.createElement('div');
  card.className = 'agentCard loading';
  card.innerHTML = `
    <div class="agentTitle">${label}</div>
    <div class="statusText">Processing<span class="statusDots"></span></div>
  `;

  let count = 0;
  const interval = setInterval(() => {
    count = (count + 1) % 4;
    card.querySelector('.statusDots').textContent = '.'.repeat(count);
  }, 300);

  results.appendChild(card);
  return {
    card,
    stop() {
      clearInterval(interval);
      card.classList.remove('loading');
      const dot = card.querySelector('.statusDots');
      if (dot) dot.remove();
    }
  };
}

function parseIdeaSuggestions(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const bullets = lines.filter(line => /^[0-9]+\.|^[-–—•·]/.test(line)).map(line => line.replace(/^[0-9]+\.|^[-–—•·]/, '').trim());
  const candidates = bullets.length ? bullets : lines;
  // For children's story ideas prefer shorter, punchy lines; accept down to 10 characters
  return candidates.filter(item => item.length > 10).slice(0, 5);
}

function renderIdeaSuggestions(output) {
  const ideas = parseIdeaSuggestions(output);
  ideaList.innerHTML = '';

  if (!ideas.length) {
    ideaContainer.classList.add('hidden');
    return;
  }

  ideas.forEach(idea => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ideaButton';
    button.textContent = idea;
    button.addEventListener('click', () => {
      document.querySelectorAll('.ideaButton').forEach(el => el.classList.remove('selected'));
      button.classList.add('selected');
      document.getElementById('prompt').value = idea;
      ideaContainer.querySelector('.ideaNote').textContent = 'Selected idea loaded into prompt. You may edit it before generating the story.';
    });
    ideaList.appendChild(button);
  });

  ideaContainer.classList.remove('hidden');
  ideaContainer.querySelector('.ideaNote').textContent = 'Click any idea to load it into your prompt and guide the story.';
}

function buildNarratorPrompt(promptText, plannerOutput, charactersOutput) {
  const selectedIdea = document.querySelector('.ideaButton.selected')?.textContent?.trim();
  return `Instruction: ${agents.narrator.instruction}\n\n` +
    (selectedIdea ? `Selected idea: ${selectedIdea}\n\n` : '') +
    (plannerOutput ? `Plot outline:\n${plannerOutput}\n\n` : '') +
    (charactersOutput ? `Characters:\n${charactersOutput}\n\n` : '') +
    `User idea: ${promptText}\n\nPlease write the full short story now.`;
}

async function runAgent(agentKey, userPrompt) {
  const agent = agents[agentKey];
  const content = `Agent: ${agent.name}\nInstruction: ${agent.instruction}\nUser idea: ${userPrompt}`;
  const { card, stop } = createAgentCard(agent.name);

  try {
    const resText = await sendToProxy(content);
    stop();
    card.innerHTML = `<div class="agentTitle">${agent.name}</div>`;
    // Reveal agent output gradually so the user sees the agent 'writing'.
    await typewriterRender(resText, card, { charDelay: 16, paragraphDelay: 420 });
    if (agentKey === 'planner') renderIdeaSuggestions(resText);
    return resText;
  } catch (err) {
    stop();
    card.textContent = `${agent.name}: (error) ${err.message}`;
    return '';
  }
}

async function runDirect(promptText, label) {
  const { card, stop } = createAgentCard(label);

  try {
    const res = await sendToProxy(promptText);
    stop();
    const finalText = (label === agents.narrator.name)
      ? ensureNarrativeClosure(res, 10, 20)
      : res;
    card.innerHTML = `<div class="agentTitle">${label}</div>`;
    await typewriterRender(finalText, card, { charDelay: 18, paragraphDelay: 520 });
    return finalText;
  } catch (err) {
    stop();
    card.textContent = `${label}: (error) ${err.message}`;
    return '(error)';
  }
}

function renderTextParagraphs(text, targetElement) {
  const normalized = String(text || '').trim();
  targetElement.innerHTML = targetElement.innerHTML || '';
  const paragraphs = normalized.split(/\n{2,}/g).filter(p => p.trim());

  if (!paragraphs.length) {
    const p = document.createElement('p');
    p.textContent = '(no text returned)';
    targetElement.appendChild(p);
    return;
  }

  paragraphs.forEach(paragraph => {
    const p = document.createElement('p');
    p.textContent = paragraph.trim();
    targetElement.appendChild(p);
  });
}

// Typewriter-style incremental reveal to simulate live writing.
async function typewriterRender(text, targetElement, opts = {}) {
  const { charDelay = 18, paragraphDelay = 450 } = opts;
  const normalized = String(text || '').trim();
  const paragraphs = normalized.split(/\n{2,}/g).map(p => p.trim()).filter(Boolean);

  // If there's no paragraph separation, split by sentences for a nicer reveal.
  if (!paragraphs.length) paragraphs.push(...normalized.split(/(?<=[.!?])\s+/).filter(Boolean));

  // Clear target and create a content container
  targetElement.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'agentTitle';
  // Preserve any previous label content if present
  const existingTitle = targetElement.querySelector('.agentTitle');
  title.textContent = existingTitle ? existingTitle.textContent : '';
  targetElement.appendChild(title);

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const para = paragraphs[pi];
    const p = document.createElement('p');
    p.textContent = '';
    p.style.opacity = '0.98';
    targetElement.appendChild(p);

    for (let i = 0; i < para.length; i++) {
      p.textContent += para[i];
      await new Promise(r => setTimeout(r, charDelay));
    }

    // small pause between paragraphs to feel like a writer thinking
    await new Promise(r => setTimeout(r, paragraphDelay));
  }
}

// Ensure the narrator returns between min and max paragraphs by adjusting output if needed.
function enforceParagraphCount(text, min = 3, max = 5) {
  const normalized = String(text || '').trim();
  let paragraphs = normalized.split(/\n{2,}/g).map(p => p.trim()).filter(Boolean);

  if (paragraphs.length > max) {
    paragraphs = paragraphs.slice(0, max);
    return paragraphs.join('\n\n');
  }

  if (paragraphs.length >= min) return paragraphs.join('\n\n');

  // If too few paragraphs, split into sentences and distribute into `min` paragraphs.
  const sentences = normalized.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  if (!sentences.length) return normalized;

  const perBucket = Math.max(1, Math.ceil(sentences.length / min));
  const buckets = [];
  for (let i = 0; i < sentences.length; i += perBucket) {
    buckets.push(sentences.slice(i, i + perBucket).join(' '));
  }

  // If we ended up with fewer buckets than min, split last bucket into single-sentence paragraphs.
  while (buckets.length < min && buckets[buckets.length - 1]) {
    const last = buckets.pop();
    const lastSentences = last.split(/(?<=[.!?])\s+/).filter(Boolean);
    buckets.push(...lastSentences.map(s => s.trim()));
  }

  return buckets.slice(0, max).join('\n\n');
}

// Ensure the narrator output contains a moral paragraph labeled 'Moral:'.
function ensureMoralExists(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return 'Moral: Be kind to others.';
  if (/\bMoral:\b/i.test(normalized)) return normalized;

  const sentences = normalized.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  let candidate = sentences[sentences.length - 1] || '';
  candidate = candidate.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  if (candidate.length < 6) candidate = 'Be kind and brave.';
  const moral = `Moral: ${candidate.charAt(0).toUpperCase()}${candidate.slice(1)}.`;
  return normalized + '\n\n' + moral;
}

// Ensure the narrator output closes cleanly, ends with The End, and fits 10-20 paragraphs.
function ensureNarrativeClosure(text, min = 10, max = 20) {
  let normalized = String(text || '').trim();
  if (!normalized) normalized = 'A gentle adventure happened, and everyone learned how to be kind.';

  normalized = ensureMoralExists(normalized).trim();
  let paragraphs = normalized.split(/\n{2,}/g).map(p => p.trim()).filter(Boolean);

  const hasMoral = paragraphs.some(p => /\bMoral:\b/i.test(p));
  if (!hasMoral) paragraphs.push('Moral: Be kind to others.');

  const last = paragraphs[paragraphs.length - 1] || '';
  if (!/^The End\.$/i.test(last)) {
    paragraphs.push('The End.');
  } else {
    paragraphs[paragraphs.length - 1] = 'The End.';
  }

  if (paragraphs.length > max) {
    const storyParas = paragraphs.filter(p => !/\bMoral:\b/i.test(p) && !/^The End\.$/i.test(p)).slice(0, max - 2);
    const moralPara = paragraphs.find(p => /\bMoral:\b/i.test(p)) || 'Moral: Be kind to others.';
    paragraphs = [...storyParas, moralPara, 'The End.'];
  }

  if (paragraphs.length < min) {
    const storyParas = paragraphs.filter(p => !/\bMoral:\b/i.test(p) && !/^The End\.$/i.test(p));
    const sentences = storyParas.join(' ').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    const targetCount = min - 2; // reserve one for moral and one for The End.
    const buckets = [];
    const perBucket = Math.max(1, Math.ceil(sentences.length / targetCount));
    for (let i = 0; i < sentences.length && buckets.length < targetCount; i += perBucket) {
      buckets.push(sentences.slice(i, i + perBucket).join(' '));
    }
    while (buckets.length < targetCount) {
      buckets.push('The characters learned something kind and grew closer.');
    }
    const moralPara = paragraphs.find(p => /\bMoral:\b/i.test(p)) || 'Moral: Be kind to others.';
    paragraphs = [...buckets, moralPara, 'The End.'];
  }

  return paragraphs.join('\n\n');
}

function clearIdeaSuggestions() {
  ideaList.innerHTML = '';
  ideaContainer.classList.add('hidden');
  ideaContainer.querySelector('.ideaNote').textContent = 'Planner will generate ideas after you click Write Story.';
}

function getSelectedPrompt() {
  return document.getElementById('prompt').value.trim();
}

const writeBtn = document.getElementById('writeBtn');
writeBtn.addEventListener('click', async () => {
  const prompt = getSelectedPrompt();
  if (!prompt) return alert('Please enter a prompt or idea.');

  const chosen = Array.from(document.querySelectorAll('.agents input:checked')).map(el => el.dataset.agent);
  if (!chosen.length) return alert('Select at least one agent.');

  document.getElementById('agentResults').innerHTML = '';
  document.getElementById('finalStory').textContent = '';

  if (!chosen.includes('planner')) clearIdeaSuggestions();

  const plannerOutput = chosen.includes('planner') ? await runAgent('planner', prompt) : '';
  const charactersOutput = chosen.includes('characters') ? await runAgent('characters', prompt) : '';

  if (chosen.includes('narrator')) {
    const narratorPrompt = buildNarratorPrompt(prompt, plannerOutput, charactersOutput);
    const final = await runDirect(narratorPrompt, agents.narrator.name);
    renderTextParagraphs(final, document.getElementById('finalStory'));
  } else {
    renderTextParagraphs((plannerOutput ? `Plot outline:\n${plannerOutput}\n\n` : '') +
      (charactersOutput ? `Characters:\n${charactersOutput}` : ''), document.getElementById('finalStory'));
  }
});

clearIdeaSuggestions();
