import fs from 'fs';

const COMMON = fs.readFileSync(__dirname + '/common.lua','utf8');

export function buildScript(script: string) {
    return COMMON + ";" + script;
}
