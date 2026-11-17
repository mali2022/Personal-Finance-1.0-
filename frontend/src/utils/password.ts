// Match the server's UTF-16 char.IsLetter/char.IsDigit checks and string length.
// Splitting into code units also keeps supplementary characters consistent with .NET char.
export function isValidNewPassword(password: string) {
  const characters = password.split('');
  return (
    password.length >= 12 &&
    password.length <= 128 &&
    characters.some((character) => /\p{L}/u.test(character)) &&
    characters.some((character) => /\p{Nd}/u.test(character))
  );
}
