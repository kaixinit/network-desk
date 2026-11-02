import fs from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
const icon = (await fs.readFile(new URL("../node_modules/bootstrap-icons/icons/globe2.svg", import.meta.url), "utf8")).replace('fill="currentColor"', 'fill="#315cce"');
const png = new Resvg(icon, { fitTo: { mode: "width", value: 256 } }).render().asPng();
const directory = new URL("../desktop/assets/", import.meta.url);
await fs.mkdir(directory, { recursive: true });
await fs.writeFile(new URL("icon.png", directory), png);
// ICO's PNG payload preserves the standard Bootstrap icon without redrawing it.
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
await fs.writeFile(new URL("icon.ico", directory), Buffer.concat([header, png]));
await fs.copyFile(new URL("../node_modules/bootstrap-icons/LICENSE", import.meta.url), new URL("LICENSE-bootstrap-icons.txt", directory));
