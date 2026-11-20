import { get, set } from 'idb-keyval';

export interface Mekanik { nama: string; nrp: string }

// Di idb-keyval (bukan localStorage) supaya service worker bisa membacanya.
export const getMekanik = async (): Promise<Mekanik | null> => (await get<Mekanik>('mekanik')) ?? null;
export const setMekanik = (m: Mekanik): Promise<void> => set('mekanik', m);
