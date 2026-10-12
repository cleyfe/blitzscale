export const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

export const rgb = (c: [number, number, number]) => `rgb(${c.join(',')})`;
