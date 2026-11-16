import { PAGES, describeAxe, selfTest } from "./a11y.js";

describeAxe("webkit", PAGES, selfTest);
