#!/usr/bin/env bash
set -euo pipefail

# Build from the exact proven v1.0.44 production reconstruction recipe.
# Apply ONLY the new canonical Windsor timetable + week/month home controls.
# Never replace the approved icon, splash or native Android Adhan implementation.
python3 .github/scripts/fix-v1043-build-typing-source.py

python3 - <<'PY'
from pathlib import Path
src = Path(".github/scripts/build-v1043-windsor-directory-resume.sh")
s = src.read_text(encoding="utf-8")
anchor = 'python3 .github/scripts/fix-v1043-windsor-directory-and-nested-resume.py\n'
insertion = (anchor
    + 'python3 .github/scripts/fix-v1044-gps-prayer-mosque-display.py\n'
    + 'python3 .github/scripts/patch-v1045-current-windsor-calendar.py\n')
assert s.count(anchor) == 1, "v1.0.43 reconstruction anchor changed"
s = s.replace(anchor, insertion, 1)
s = s.replace("1.0.43", "1.0.45")
s = s.replace("versionCode: 87", "versionCode: 89")
s = s.replace("HASSOUN_ANDROID_V1043_SOURCE_VERIFIED", "HASSOUN_ANDROID_V1045_SOURCE_VERIFIED")
s = s.replace("HASSOUN_ANDROID_V1043_MANIFEST_VERIFIED", "HASSOUN_ANDROID_V1045_MANIFEST_VERIFIED")
s = s.replace("HASSOUN_V1043_APK_READY", "HASSOUN_V1045_APK_READY")
s = s.replace(
    "Hassoun-v1.0.45-windsor-mosques-resume.apk",
    "Hassoun-v1.0.45-current-windsor-week-month.apk"
)
output = Path("/tmp/build-hassoun-v1045-from-approved-v1044.sh")
output.write_text(s, encoding="utf-8")
output.chmod(0o755)
print("HASSOUN_V1045_PROTECTED_V1044_SOURCE_RECONSTRUCTION_READY")
PY

bash /tmp/build-hassoun-v1045-from-approved-v1044.sh

# Validate the final reconstructed source and branded images, not the stale
# version of mobile/ checked out before reconstruction.
python3 - <<'PY'
from pathlib import Path
from PIL import Image
p = Path("mobile/app.config.ts").read_text(encoding="utf-8")
assert 'version: "1.0.45"' in p and "versionCode: 89" in p
assert 'icon: "./assets/icon.png"' in p
assert "adaptive-icon.png" in p
source = Path("mobile/src/HomePrayerPage.tsx").read_text(encoding="utf-8")
assert "HASSOUN_RELEASE_WEEK_MONTH_V1045" in source
assert "Show Weekly" in source and "Show Monthly" in source
for file in ["icon.png", "adaptive-icon.png", "splash-logo.png", "hassoun-logo.png"]:
    path = Path("mobile/assets") / file
    with Image.open(path) as im:
        im.verify()
    assert path.stat().st_size > 1000, f"Official branding asset missing: {path}"
    print(f"APPROVED_BRANDING_ASSET_VERIFIED: {path}")
assert Path("mobile/modules/prayer-audio/android/src/main").exists(), "Android Azan native module missing"
print("HASSOUN_V1045_RELEASE_ARTIFACT_AND_BRANDING_VERIFIED")
PY
