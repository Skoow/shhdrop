// Remplaçant de pages.ts sans __SALONS__ (greffon shh-salons de vite.config.ts) : aucun écran,
// aucun import. App.svelte ne les montre jamais sans le drapeau (match() ne rend pas ces routes).
import type { Component } from "svelte";

const absente = (() => {
  throw new Error("salon_absent");
}) as unknown as Component;
export const Salon = absente;
export const SalonNouveau = absente;
