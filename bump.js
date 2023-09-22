import json from './package.json' assert { type: 'json' };
import fs from 'fs';

const version = json.version.split('.');
version[2] = (parseInt(version[2]) + 1).toString();
json.version = version.join('.');
fs.writeFileSync('package.json', JSON.stringify(json, null, 2));
