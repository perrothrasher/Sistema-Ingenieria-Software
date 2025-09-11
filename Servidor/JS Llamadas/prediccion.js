// Servidor/JS Llamadas/prediccion.js
const { spawn } = require('child_process');
const path = require('path');

function pythonCmd() {
  return process.platform === 'win32' ? 'python' : 'python3';
}

function runPy(args = []) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, '..', 'ML', 'modelo_dotacion.py');
    const py = spawn(pythonCmd(), [script, ...args], {
      cwd: path.join(__dirname, '..', 'ML')
    });
    let out = '', err = '';
    py.stdout.on('data', d => out += d.toString());
    py.stderr.on('data', d => err += d.toString());
    py.on('close', code => {
      if (code !== 0) return reject(new Error(err || `Python exited ${code}`));
      try { resolve(JSON.parse(out)); } 
      catch (e) { reject(new Error('JSON inválido del modelo: ' + e.message + ' :: ' + out)); }
    });
  });
}

// POST /prediccion/entrenar
async function entrenarModelo(req, res) {
  try {
    // Carpeta con los Excels (por defecto ML/folios)
    const dataDir = req.body?.dataDir || path.join(__dirname, '..', 'ML', 'folios');
    const resp = await runPy(['--train', '--data-dir', dataDir]);
    res.status(200).json(resp);
  } catch (e) {
    console.error('[PRED] entrenarModelo', e);
    res.status(500).json({ ok:false, message: e.message });
  }
}

// GET /prediccion/proyectar[?anio=YYYY&mes=MM]
async function proyectar(req, res) {
  try {
    const { anio, mes } = req.query;
    const dataDir = req.query?.dataDir || path.join(__dirname, '..', 'ML', 'folios');

    const args = ['--predict', '--data-dir', dataDir];
    if (anio) args.push('--anio', String(anio));
    if (mes)  args.push('--mes', String(mes).padStart(2,'0'));

    const resp = await runPy(args);
    res.status(200).json(resp);
  } catch (e) {
    console.error('[PRED] proyectar', e);
    res.status(500).json({ ok:false, message: e.message });
  }
}

module.exports = { entrenarModelo, proyectar };
