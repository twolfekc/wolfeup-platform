'use strict';

const OLLAMA_URL = process.env.OLLAMA_PRIMARY_URL || 'http://192.168.1.70:11434';

async function collect() {
  try {
    const [tagsRes, psRes] = await Promise.all([
      fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${OLLAMA_URL}/api/ps`,   { signal: AbortSignal.timeout(5000) }),
    ]);

    const tags = tagsRes.ok ? await tagsRes.json() : { models: [] };
    const ps   = psRes.ok   ? await psRes.json()   : { models: [] };

    const availableModels = (tags.models || []).map(m => ({
      name: m.name,
      sizeGb: +(m.size / 1e9).toFixed(1),
    }));

    const loadedModels = (ps.models || []).map(m => ({
      name: m.name,
      vramGb: +(m.size_vram / 1e9).toFixed(1),
    }));

    const totalVramGb = loadedModels.reduce((sum, m) => sum + m.vramGb, 0);

    return {
      available: availableModels.length,
      loaded: loadedModels.length,
      loadedNames: loadedModels.map(m => m.name),
      availableNames: availableModels.map(m => m.name),
      vramUsedGb: +totalVramGb.toFixed(1),
      vramTotalGb: 24,
      online: true,
    };
  } catch (err) {
    return { available: 0, loaded: 0, loadedNames: [], availableNames: [], vramUsedGb: 0, vramTotalGb: 24, online: false, error: err.message };
  }
}

module.exports = { collect };
