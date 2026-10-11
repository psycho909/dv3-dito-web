# Font asset source

- Upstream: [ACh-K/Cubic-11](https://github.com/ACh-K/Cubic-11)
- Release: `v1.500`, commit `4c566f7d6cc5c05ee360fe9cff56b5da1fcafd4d`
- Input: `fonts/web/Cubic_11.woff2`
- Input SHA-256: `d28e92846e00c3696b30d950d4eddf445dd90b2a970e67cdb629796c1997ef67`
- Input license: upstream `OFL.txt`, copied without edits; SHA-256 `2b6e5938e5cffa0b9e183bd05f8c363e174e7ebed1a0556e2855fd1707fa2188`
- Subset: Unicode `U+0030–U+0039`, `U+0041`, `U+002F` (`0-9 A /`)
- Tooling: fontTools `4.61.1`; WOFF2 Brotli support `Brotli 1.1.0` (temporary tooling, not a project dependency)
- Output: `dito-forge-digits.woff2`, 1,848 bytes; SHA-256 `0523d3bfd066f7d35f5b48ab0b6f43cc133192d17b4a9583237841baac8fa624`
- Reproducible timestamp: pin the shipped subset’s OpenType `head.modified` to `3874545749` and disable automatic timestamp updates.
- Reserved Font Name handling: subset font name IDs 1/4/16/21 → `Dito Forge Digits`; IDs 2/17/22 → `Regular`; ID 3 → `Dito Forge Digits 1.0`; ID 6 → `DitoForgeDigits-Regular`.

Rebuild from the repository root in a disposable directory (does not overwrite the shipped asset):

```sh
mkdir -p /tmp/dito-forge-font-rebuild/fonts/web
cd /tmp/dito-forge-font-rebuild
curl --fail --location --output fonts/web/Cubic_11.woff2 https://raw.githubusercontent.com/ACh-K/Cubic-11/4c566f7d6cc5c05ee360fe9cff56b5da1fcafd4d/fonts/web/Cubic_11.woff2
printf '%s\n' 'd28e92846e00c3696b30d950d4eddf445dd90b2a970e67cdb629796c1997ef67  fonts/web/Cubic_11.woff2' | sha256sum --check
python3 -m venv .venv
.venv/bin/python -m pip install fontTools==4.61.1 Brotli==1.1.0
.venv/bin/python - <<'PYTHON'
from fontTools import subset
from fontTools.ttLib import TTFont

font = TTFont('fonts/web/Cubic_11.woff2', recalcTimestamp=False)
font['head'].modified = 3874545749
options = subset.Options()
options.flavor = 'woff2'
options.name_IDs = ['*']
options.name_legacy = True
options.name_languages = ['*']
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=[*range(0x30, 0x3A), 0x41, 0x2F])
subsetter.subset(font)

renames = {
    1: 'Dito Forge Digits', 2: 'Regular',
    3: 'Dito Forge Digits 1.0', 4: 'Dito Forge Digits',
    6: 'DitoForgeDigits-Regular',
    16: 'Dito Forge Digits', 17: 'Regular',
    21: 'Dito Forge Digits', 22: 'Regular',
}
for record in font['name'].names:
    if record.nameID in renames:
        value = renames[record.nameID]
        record.string = value.encode(record.getEncoding(), errors='replace')
font.save('dito-forge-digits.woff2')
PYTHON
printf '%s\n' '0523d3bfd066f7d35f5b48ab0b6f43cc133192d17b4a9583237841baac8fa624  dito-forge-digits.woff2' | sha256sum --check
```
