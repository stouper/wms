// apps/wms-desktop/scripts/build.mjs
import * as esbuild from "esbuild";
import fs from "fs";

const isWatch = process.argv.includes("--watch");

fs.mkdirSync("renderer/dist", { recursive: true });

const common = {
  entryPoints: ["renderer/src/main.jsx"],
  bundle: true,
  outfile: "renderer/dist/bundle.js",
  sourcemap: true,
  platform: "browser",
  target: ["chrome114"], // 적당히
  loader: {
    ".png": "dataurl",
    ".jpg": "dataurl",
    ".jpeg": "dataurl",
    ".svg": "dataurl",
    ".woff": "dataurl",
    ".woff2": "dataurl",
  },
};

async function run() {
  if (isWatch) {
    const ctx = await esbuild.context(common);
    await ctx.watch();
    console.log("[esbuild] watching...");
  } else {
    await esbuild.build(common);
    console.log("[esbuild] build done");
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
