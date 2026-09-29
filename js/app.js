import * as store from './store.js';
import { setCurrency } from './util.js';
import { render, bindEvents, toast } from './ui.js';

function maintenance() {
  if (!store.state.settings.onboarded) return;
  const created = store.generateRecurring();
  if (created) {
    store.save();
    toast(`🔁 ${created} ta takroriy to‘lov yozildi`);
  }
}

store.load();
setCurrency(store.state.settings.currency);
bindEvents();
maintenance();
render();

// Ilova qayta ochilganda (masalan, ertasi kuni) — takroriy to'lovlar va sanalar yangilanadi.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    maintenance();
    render();
  }
});

// Brauzer ma'lumotni o'zi o'chirib yubormasligini so'raymiz.
navigator.storage?.persist?.().catch(() => {});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
