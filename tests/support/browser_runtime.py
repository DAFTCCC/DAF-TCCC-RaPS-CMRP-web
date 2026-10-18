"""Use system Chromium locally or Playwright's installed browser in CI."""
import os
from pathlib import Path

def chromium_options():
 options={"headless":True,"args":["--no-sandbox"]}
 executable=os.environ.get("FIELDREADY_CHROMIUM_EXECUTABLE")
 if executable:options["executable_path"]=executable
 elif Path("/usr/bin/chromium").is_file():options["executable_path"]="/usr/bin/chromium"
 return options
