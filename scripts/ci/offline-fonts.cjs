// CI-only Next font fixture: no downloaded font or third-party font binary.
// Keep this URL explicit so a font/config change requires updating the check.
module.exports = {
  'https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap':
    '@font-face { font-family: Manrope; src: local(Arial); font-weight: 200 800; }',
};
