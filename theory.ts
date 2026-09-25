import { createHash } from "crypto";
import express from "express";
const app = express();

const key = "dGhlIHNhbXBsZSBub25jZQ==";
const magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const accept = createHash("sha1")
  .update(key + magic)
  .digest("base64");
console.log(accept);

app.use(express.json());

const port = 8080;
app.listen(port, () => console.log(`API on :${port}`));
