import { useSyncExternalStore } from 'react';

// Historial guardado en el navegador (por dispositivo). Cada registro:
// { id, date, name, total, good, bad, thumb }
// ponytail: localStorage (~5 MB). Si se quiere compartir entre dispositivos,
// cambiar commit() por llamadas a un endpoint del backend.
const KEY = 'eggclassify.history.v1';
const MAX_RECORDS = 300;

function read() {
  try {
    // 'upload': registros de la antigua carga de fotos, ya eliminada
    return (JSON.parse(localStorage.getItem(KEY)) ?? []).filter((r) => r.source !== 'upload');
  } catch {
    return [];
  }
}

let cache = read();
const listeners = new Set();

function commit(next) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // cuota llena o almacenamiento bloqueado: el historial sigue en memoria
  }
  listeners.forEach((l) => l());
}

export const addRecord = (record) =>
  commit([{ id: crypto.randomUUID(), date: new Date().toISOString(), ...record }, ...cache].slice(0, MAX_RECORDS));
export const removeRecord = (id) => commit(cache.filter((r) => r.id !== id));
export const clearHistory = () => commit([]);

export function useHistory() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => cache,
  );
}
