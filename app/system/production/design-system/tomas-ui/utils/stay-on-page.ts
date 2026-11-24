import type { MouseEvent } from "react";

// A link inside the srcdoc frame would navigate the frame away and drop every sample with it.
export const stayOnPage = (event: MouseEvent) => event.preventDefault();
