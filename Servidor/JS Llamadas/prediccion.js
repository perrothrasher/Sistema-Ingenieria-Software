// Servidor/JS Llamadas/prediccion.js
const { spawn } = require('child_process');
const path = require('path');

function runPy(args = []) {
  return new Promise((resolve, reject) => {
    const py = spawn('python', [path.join(__dirname, '..', 'ML', 'modelo_dotacion.py'), ...args], {
      cwd: path.join(__dirname, '..', 'ML')
    });
    let out = '', err = '';
    py.stdout.on('data', d => out += d.toString());
    py.stderr.on('data', d => err += d.toString());
    py.on('close', code => {
      if (code !== 0) return reject(new Error(err || `Python exited ${code}`));
      try { resolve(JSON.parse(out)); } catch (e) { reject(new Error('JSON inválido del modelo: ' + e.message)); }
    });
  });
}

// POST /prediccion/entrenar
async function entrenarModelo(req, res) {
  try {
    const dataDir = req.body?.dataDir || path.join(__dirname, '..', '..'); // carpeta donde están tus Excels
    const resp = await runPy(['--train', '--data-dir', dataDir]);
    res.status(200).json(resp);
  } catch (e) {
    console.error('[PRED] entrenarModelo', e);
    res.status(500).json({ message: e.message });
  }
}

// GET /prediccion/proyectar?anio=2025&mes=9
async function proyectar(req, res) {
  try {
    const { anio, mes } = req.query;
    const dataDir = req.query?.dataDir || path.join(__dirname, '..', '..');
    const args = ['--predict', '--data-dir', dataDir];
    if (anio) args.push('--anio', String(anio));
    if (mes)  args.push('--mes', String(mes));
    const resp = await runPy(args);
    res.status(200).json(resp);
  } catch (e) {
    console.error('[PRED] proyectar', e);
    res.status(500).json({ message: e.message });
  }
}

module.exports = { entrenarModelo, proyectar };
