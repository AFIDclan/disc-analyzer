const esbuild = require('esbuild');
const path = require('path');

const buildOptions = {
    entryPoints: [
        path.join(__dirname, 'webapp/src/app.js'),
        path.join(__dirname, 'webapp/src/styles.css')
    ],
    bundle: true,
    outdir: path.join(__dirname, 'webapp/public'),
    platform: 'browser',
    target: ['es2020'],
    minify: process.env.NODE_ENV === 'production',
    sourcemap: process.env.NODE_ENV !== 'production',
    loader: {
        '.png': 'file',
        '.jpg': 'file',
        '.jpeg': 'file',
        '.svg': 'file',
        '.gif': 'file'
    }
};

async function build() {
    try {
        console.log('Building webapp...');
        await esbuild.build(buildOptions);
        console.log('Build completed successfully!');
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

// Run build if this file is executed directly
if (require.main === module) {
    build();
}

module.exports = { build, buildOptions };