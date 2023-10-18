const fs = require('fs');
const json = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const version = json.version.split('.');
version[2] = (parseInt(version[2]) + 1).toString();
json.version = version.join('.');
fs.writeFileSync('package.json', JSON.stringify(json, null, 2));
