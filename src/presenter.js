// Speaker notes: what to say at each chapter, in the page or in a separate window.
const NOTES = {
  earth: 'Welcome everyone. Our topic is conservation and environmental restoration: practical methods for protecting and repairing the environment. Press Next and let the zoom play.',
  hero: 'This valley is a model we built. It starts badly damaged, and each method we describe restores part of it. Watch the bars at the top.',
  damage: 'Ask the class to find the five problems. Then read out the three questions from the brief. Everything that follows answers one of them.',
  part1: 'Question 1: strategies for conserving and restoring natural resources. We cover forests, soil and water.',
  forest: 'Strategies for forests: plant native mixes, protect natural regrowth, and harvest sustainably. Use the Loess Plateau as evidence. Do the prediction with a show of hands.',
  soil: 'Strategies for soil: contour ploughing, terraces, less tillage and mulch, and natural fibre mats on steep ground. Contour ploughing can cut soil loss by up to 50%.',
  wetland: 'Strategies for water: rebuild reed beds, plant buffer strips and use less water. Restored wetlands removed a median of 37% of nitrogen and 46% of phosphorus.',
  lake: 'Ask why extra fertiliser could kill fish. Walk through eutrophication, then finish on the reed bed stopping the source. This is why restoring wetlands matters.',
  part2: 'Question 2: strategies for reducing pollution, in air, water and on land.',
  air: 'Strategies for air: scrubbers, clean energy and cleaner transport. Sulphur dioxide from US power plants fell 94%.',
  pipe: 'Strategies for water pollution: treat wastewater, clean up past pollution, and keep chemicals out of drains. The Thames shows it works: over 115 fish species recorded since 1957.',
  waste: 'Strategies for land pollution, best first: reduce, reuse, recycle, compost, then seal old dumps. Only about 9% of plastic waste is recycled, so reducing comes first.',
  part3: 'Question 3: the effect of changing our practices. For each of the five, say what changes, what improves and what it costs.',
  farm: 'Natural materials in agriculture. What changes: compost, cover crops, legumes and push-pull. Effect: 70% less nitrate leached with cover crops. Cost: more labour.',
  organic: 'Organic agriculture. Effect: about 30% more species. Cost: yields about 19% lower, or 8 to 9% with rotation. State both sides, because the question asks for the effect, not just the benefit.',
  biomag: 'A clear effect of changing a practice. Point out that the water looked safe, yet top predators were poisoned. After the ban, bald eagles recovered.',
  corridor: 'Conservation methods. What changes: protected areas, corridors, paying landowners and seed banks. Effect: Costa Rica went from a quarter forest to over half. Cost: land set aside. Do the prediction.',
  school: 'Education. What changes: school gardens, farmer training and citizen science. Effect: restoration lasts because people understand it. Cost: it is slow, and knowledge alone is not always enough.',
  monitor: 'Monitoring strategies. What changes: sensors, drones, camera traps and bioindicators. Effect: problems are caught early. Cost: time and equipment, and someone has to act on the data. Do the prediction.',
  flyover: 'Let the class watch for a moment. Every change on screen came from a method we described.',
  compare: 'Drag the handle slowly from year 0 to year 30. Ask which change made the biggest difference.',
  effects: 'This table is the direct answer to question 3. Read out one improvement and one cost for at least two rows.',
  simulator: 'Ask a volunteer to choose practices, then drag through the years. Point out that yield drops first and soil improves slowly. This shows the effect of a change over time.',
  lab: 'Pick one or two models. The soil profile with the eroded toggle and the scrubber work best.',
  answers: 'Summarise. Read one line from each column, so the three questions are answered clearly.',
  quiz: 'Split the room into teams. Read each question aloud and read out the explanation. Each question is labelled with the part of the brief it tests.',
  posters: 'Move through these quickly and mention that they can be saved and printed.',
  plan: 'Ask each person to pick one practical action they will really do this term.',
  sources: 'Thank the class and take questions.',
};

export function initPresenter(chapters) {
  const panel = document.getElementById('notesPanel');
  const body = document.getElementById('notesBody');
  const title = document.getElementById('notesTitle');
  const next = document.getElementById('notesNext');
  const btn = document.getElementById('toolNotes');
  const help = document.getElementById('helpPanel');
  let cur = '', popup = null;
  const titles = chapters.map((c) => [c.id, c.dataset.title]);

  function html(id) {
    const i = titles.findIndex(([k]) => k === id);
    return { title: titles[i]?.[1] ?? '', note: NOTES[id] ?? '', next: titles[i + 1] ? `Next: ${titles[i + 1][1]}` : 'This is the last chapter.' };
  }
  function render() {
    const h = html(cur);
    title.textContent = h.title; body.textContent = h.note; next.textContent = h.next;
    if (popup && !popup.closed) {
      const d = popup.document;
      d.getElementById('t').textContent = h.title; d.getElementById('b').textContent = h.note; d.getElementById('n').textContent = h.next;
    }
  }
  function toggle() {
    panel.hidden = !panel.hidden;
    btn.setAttribute('aria-pressed', !panel.hidden);
    render();
  }
  function openWindow() {
    try {
      popup = window.open('', 'valley-notes', 'width=560,height=620');
      if (!popup) throw new Error('blocked');
      popup.document.write(`<!DOCTYPE html><html><head><title>Speaker notes</title><style>
        body{font:1.5rem/1.5 Verdana,sans-serif;margin:0;padding:1.5rem;background:#17261f;color:#f3f7f4}
        h1{font-size:1.9rem;margin:0 0 .75rem}#n{color:#f2b705;font-size:1.1rem;font-weight:700}#c{font-size:2.4rem;font-weight:700;margin:0 0 .5rem}
      </style></head><body><p id="c">0:00</p><h1 id="t"></h1><p id="b"></p><p id="n"></p></body></html>`);
      popup.document.close();
      const t0 = Date.now(), pop = popup;
      const iv = setInterval(() => {
        if (pop.closed) { clearInterval(iv); return; }
        const s = Math.floor((Date.now() - t0) / 1000);
        pop.document.getElementById('c').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      }, 1000);
      panel.hidden = true;
      btn.setAttribute('aria-pressed', false);
      render();
    } catch {
      next.textContent = 'This viewer blocks new windows. Open index.html directly to use a separate notes window.';
    }
  }
  btn.addEventListener('click', toggle);
  document.getElementById('notesClose').addEventListener('click', toggle);
  document.getElementById('notesPop').addEventListener('click', openWindow);
  document.getElementById('helpClose').addEventListener('click', () => { help.hidden = true; });
  return {
    toggle,
    toggleHelp: () => { help.hidden = !help.hidden; },
    update(id) { if (id !== cur) { cur = id; render(); } },
  };
}
