"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBasicAuthenticationToken = void 0;
const base64Encoder_1 = require("../base64Encoder");
function createBasicAuthenticationToken(authenticationData) {
    let login;
    let secret;
    if ('username' in authenticationData) {
        login = authenticationData.username;
        secret = authenticationData.password;
    }
    else {
        login = authenticationData.email;
        secret = authenticationData.apiToken;
    }
    const token = base64Encoder_1.Base64Encoder.encode(`${login}:${secret}`);
    return `Basic ${token}`;
}
exports.createBasicAuthenticationToken = createBasicAuthenticationToken;
//# sourceMappingURL=createBasicAuthenticationToken.js.map