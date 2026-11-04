import os
import tempfile

# Antes de importar la app: la ruta de datos se fija al importar.
os.environ["CRAGSHADE_DATA"] = tempfile.mkdtemp(prefix="cragshade-test-")
os.environ["CRAGSHADE_ALLOW_DELETE"] = "1"
