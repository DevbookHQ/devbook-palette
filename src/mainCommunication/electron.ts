// Electron requires were moved into this separate file because there were several cyclic dependencies,
// preventing starting the app.
const electron = window.require('electron') as typeof import('electron');

export const crypto = electron.remote.require('crypto') as typeof import('crypto');
export const querystring = electron.remote.require('querystring') as typeof import('querystring');

export const extensions = electron.remote.require('../main/extensions') as typeof import('../main/extensions');

const app = electron.app || electron.remote.app;
const isEnvSet = 'ELECTRON_IS_DEV' in electron.remote.process.env;
const getFromEnv = parseInt(electron.remote.process.env.ELECTRON_IS_DEV || '0', 10) === 1;
export const isDev = isEnvSet ? getFromEnv : !app.isPackaged;

export default electron;