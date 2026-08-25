// Every route renders the same thing. The screen is chosen on the device from
// the address bar (see components/Screen.tsx); these files exist so that a
// cold load or a shared link on any of these URLs is answered at all.
export { default } from "@/components/Screen";
