import { PAGES, describeAxe, selfTest } from "./a11y.js";

describeAxe("chromium", PAGES, selfTest);
