import { build } from 'esbuild';
import { mkdirSync } from 'fs';

const isWatch = process.argv.includes('--watch');

mkdirSync('renderer/dist', { recursive: true });

const common = {
  entryPoints: ['renderer/src/main.jsx'],
  outfile: 'renderer/dist/bundle.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['es2018'],
  sourcemap: true,
  loader: { '.jsx': 'jsx' },
  define: {
    'process.env.NODE_ENV': JSON.stringify(isWatch ? 'development' : 'production')
  },
  external: [
    'electron',    // 렌더러 번들에서 제외
    'fs', 'path', 'crypto', 'stream', 'util' // 혹여 라이브러리 내부가 참조해도 제외
  ],
  logLevel: 'info'
};

if (isWatch) {
  const ctx = await build({ ...common, watch: true });
  console.log('[esbuild] watching...');
} else {
  await build(common);
  console.log('[esbuild] build done');
}
