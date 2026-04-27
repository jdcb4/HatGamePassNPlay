const { execFileSync } = require('node:child_process');
const packageJson = require('../package.json');

const imageName = 'jdcb4/hat-game-pass-n-play';
const version = packageJson.version;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`package.json version must use MAJOR.MINOR.PATCH format. Received: ${version}`);
}

execFileSync('docker', ['build', '-t', `${imageName}:${version}`, '-t', `${imageName}:latest`, '.'], {
  stdio: 'inherit'
});

console.log(`Built ${imageName}:${version} and ${imageName}:latest`);
