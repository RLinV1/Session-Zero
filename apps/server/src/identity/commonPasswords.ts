const COMMON = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "p@ssword", "12345678", "123456789",
  "1234567890", "12341234", "11111111", "00000000", "87654321", "qwertyui", "qwerty123", "qwertyuiop", "1q2w3e4r",
  "1q2w3e4r5t", "q1w2e3r4", "iloveyou", "iloveyou1", "letmein1", "letmein123", "welcome1", "welcome123", "admin123",
  "administrator", "abc12345", "abcd1234", "abcdefgh", "monkey123", "dragon123", "football", "baseball", "superman",
  "trustno1", "sunshine", "princess", "starwars", "whatever", "changeme", "changeme123", "default123", "master123",
  "shadow123", "michael1", "jennifer", "pokemon1", "minecraft", "dungeons", "dungeon1", "dungeonmaster", "sessionzero",
  "session0", "sessionzero1", "tabletop1", "rpgrpg12", "asdfghjk", "asdf1234", "zxcvbnm1", "zxcvbnm123", "passpass",
  "test1234", "testtest", "guest123", "user1234", "login123", "secret123", "secretpassword", "mypassword", "mypassword1",
]);

export function isCommonPassword(password: string): boolean {
  return COMMON.has(password.trim().toLowerCase());
}
