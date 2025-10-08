import typescript from 'rollup-plugin-typescript2';

export default {
  input: 'src/main.ts',
  output: {
    dir: 'dist',
    format: 'cjs',
    sourcemap: true
  },
  external: ['obsidian'],
  plugins: [typescript()]
};
