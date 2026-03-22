"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOAuth2AuthenticationToken = void 0;
function createOAuth2AuthenticationToken(authenticationData) {
    return `Bearer ${authenticationData.accessToken}`;
}
exports.createOAuth2AuthenticationToken = createOAuth2AuthenticationToken;
//# sourceMappingURL=createOAuth2AuthenticationToken.js.map