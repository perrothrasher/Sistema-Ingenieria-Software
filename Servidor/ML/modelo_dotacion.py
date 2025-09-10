# Servidor/ML/modelo_dotacion.py
import os, re, json, math, argparse, pickle
import pandas as pd
import numpy as np
from datetime import datetime

try:
    from sklearn.ensemble import RandomForestClassifier
except Exception:
    RandomForestClassifier = None

def norm(s):
    s = str(s).strip().lower()
    s = re.sub(r'\s+',' ', s)
    return (s.replace('á','a').replace('é','e').replace('í','i')
             .replace('ó','o').replace('ú','u').replace('ñ','n'))

def month_from_spanish(name):
    name = name.strip().lower()
    m = {'enero':1,'febrero':2,'marzo':3,'abril':4,'mayo':5,'junio':6,'julio':7,'agosto':8,
         'septiembre':9,'setiembre':9,'octubre':10,'noviembre':11,'diciembre':12}
    for k,v in m.items():
        if k in name: return v
    return None

def parse_month_year_from_filename(path):
    base = os.path.basename(path)
    m = month_from_spanish(base) or 1
    y = int(re.search(r'(20\d{2})', base).group(1)) if re.search(r'(20\d{2})', base) else datetime.now().year
    return m, y

def read_one(path):
    xls = pd.ExcelFile(path)
    sheet = xls.sheet_names[0]
    df = pd.read_excel(path, sheet_name=sheet)
    df.columns = [norm(c) for c in df.columns]

    user_col = next((c for c in df.columns if 'usuario' in c), None)
    per_user_col = 'recuento de folio.1' if 'recuento de folio.1' in df.columns else (
                    'recuento de folio' if 'recuento de folio' in df.columns else
                    next((c for c in df.columns if 'folio' in c or 'folios' in c), None))

    vac_cols = [c for c in df.columns if 'vacac' in c]
    lic_cols = [c for c in df.columns if 'licenc' in c]

    def flag_any(row, cols, kw=('si','sí','vacaciones','true','1')):
        for c in cols:
            v = str(row.get(c,'')).strip().lower()
            if any(k in v for k in kw): return True
        return False

    df['_vac'] = df.apply(lambda r: flag_any(r, vac_cols), axis=1) if vac_cols else False
    df['_lic'] = df.apply(lambda r: flag_any(r, lic_cols, kw=('si','sí','licencia','true','1')), axis=1) if lic_cols else False

    m, y = parse_month_year_from_filename(path)
    out = pd.DataFrame({
        'anio': y,
        'mes': m,
        'usuario': df[user_col] if user_col else 'desconocido',
        'folios_usuario': pd.to_numeric(df[per_user_col], errors='coerce').fillna(0).astype(int) if per_user_col else 0,
        'vacaciones': df['_vac'] if isinstance(df['_vac'], pd.Series) else False,
        'licencia':   df['_lic'] if isinstance(df['_lic'], pd.Series) else False
    })
    out = out.groupby(['anio','mes','usuario','vacaciones','licencia'], as_index=False)['folios_usuario'].sum()
    return out

def load_all(data_dir):
    files = [os.path.join(data_dir, f) for f in os.listdir(data_dir) if f.endswith('.xlsx')]
    files = [f for f in files if 'Ventas e Ingreso por Usuario' in os.path.basename(f)]
    if not files: raise RuntimeError('No se encontraron Excel en ' + data_dir)
    allm = pd.concat([read_one(p) for p in sorted(files)], ignore_index=True)
    return allm

def capacidad_optima_por_mes(allm):
    def comp(g):
        elig = g[~g['vacaciones'] & ~g['licencia']]
        if elig.empty:
            return pd.Series({'cap': np.nan, 'max': np.nan, 'min': np.nan, 'activos': 0})
        per_user = elig.groupby('usuario', as_index=False)['folios_usuario'].sum()
        mx = per_user['folios_usuario'].max()
        mn = per_user.loc[per_user['folios_usuario']>0, 'folios_usuario'].min()
        if pd.isna(mn): mn = mx
        cap = int(round((mx + mn)/2))
        return pd.Series({'cap': cap, 'max': int(mx), 'min': int(mn), 'activos': int(per_user['usuario'].nunique())})
    cap = allm.groupby(['anio','mes']).apply(comp).reset_index().rename(
        columns={'cap':'capacidad_optima','max':'max_f','min':'min_f','activos':'trab_activos'})
    agg = allm.groupby(['anio','mes']).agg(
        produccion_total=('folios_usuario','sum'),
        trabajadores_reales=('usuario', lambda s: s[~allm.loc[s.index,'vacaciones'] & ~allm.loc[s.index,'licencia']].nunique())
    ).reset_index()
    out = cap.merge(agg, on=['anio','mes'], how='left').sort_values(['anio','mes']).reset_index(drop=True)
    return out

def construir_dataset(monthly):
    rows = []
    for i in range(len(monthly)-1):
        cur = monthly.iloc[i]; nxt = monthly.iloc[i+1]
        cap = cur['capacidad_optima']
        if pd.isna(cap) or cap <= 0:
            estado = 'Indeterminado'; nec = np.nan
        else:
            nec = math.ceil(nxt['produccion_total'] / cap)
            if nxt['trabajadores_reales'] > nec: estado = 'Sobredotacion'
            elif nxt['trabajadores_reales'] < nec: estado = 'Subdotacion'
            else: estado = 'Adecuado'
        rows.append({
            'anio': int(cur['anio']), 'mes': int(cur['mes']),
            'capacidad_optima': int(cap) if not pd.isna(cap) else None,
            'prod_sig': int(nxt['produccion_total']),
            'trab_reales_sig': int(nxt['trabajadores_reales']),
            'trab_neces_sig': int(nec) if not pd.isna(nec) else None,
            'estado_sig': estado
        })
    return pd.DataFrame(rows)

def entrenar_guardar(dataset, out_path='model.pkl'):
    if RandomForestClassifier is None:
        return {'ok': False, 'message': 'scikit-learn no disponible en el entorno'}
    df = dataset[dataset['estado_sig'].isin(['Sobredotacion','Subdotacion','Adecuado'])].copy()
    if df.empty: return {'ok': False, 'message': 'Dataset insuficiente para entrenar'}
    X = df[['anio','mes','capacidad_optima','prod_sig']].values
    y = df['estado_sig'].replace({'Sobredotacion':'sobre','Subdotacion':'sub','Adecuado':'ok'}).values
    clf = RandomForestClassifier(n_estimators=300, random_state=42)
    clf.fit(X, y)
    with open(out_path,'wb') as f: pickle.dump(clf, f)
    return {'ok': True, 'message': 'Modelo entrenado', 'clases': sorted(list(set(y)))}

def proyectar_siguiente(monthly, anio=None, mes=None, model_path='model.pkl'):
    # si piden un mes/año específicos, proyectar para ese (a partir del mes anterior disponible)
    monthly = monthly.sort_values(['anio','mes']).reset_index(drop=True)
    if anio is None or mes is None:
        # usa último mes como base y proyecta el siguiente
        base = monthly.iloc[-2] if len(monthly) >= 2 else monthly.iloc[-1]
        siguiente = monthly.iloc[-1]
    else:
        # buscar fila del mes anterior
        idx = monthly.index[(monthly['anio']==int(anio)) & (monthly['mes']==int(mes))].tolist()
        if not idx: raise RuntimeError('Mes base no encontrado')
        i = idx[0]
        if i+1 >= len(monthly): raise RuntimeError('No hay mes siguiente en los datos')
        base = monthly.iloc[i]; siguiente = monthly.iloc[i+1]

    cap = base['capacidad_optima']
    prod_sig = siguiente['produccion_total']

    # intentar cargar modelo, si no hay predecimos estado con regla de negocio
    estado_regla = 'Indeterminado'
    if not pd.isna(cap) and cap > 0:
        necesarios = math.ceil(prod_sig / cap)
        if siguiente['trabajadores_reales'] > necesarios: estado_regla = 'sobre'
        elif siguiente['trabajadores_reales'] < necesarios: estado_regla = 'sub'
        else: estado_regla = 'ok'
    else:
        necesarios = None

    pred_modelo = None
    if os.path.exists(model_path) and RandomForestClassifier is not None:
        with open(model_path,'rb') as f: clf = pickle.load(f)
        X = np.array([[int(base['anio']), int(base['mes']), int(cap), int(prod_sig)]], dtype=float)
        pred_modelo = clf.predict(X)[0]

    return {
        'mes_base': {'anio': int(base['anio']), 'mes': int(base['mes']), 'capacidad_optima': int(cap) if not pd.isna(cap) else None},
        'evaluacion_siguiente': {
            'anio': int(siguiente['anio']), 'mes': int(siguiente['mes']),
            'produccion_total': int(prod_sig),
            'trabajadores_reales': int(siguiente['trabajadores_reales']),
            'trabajadores_necesarios': int(necesarios) if necesarios is not None else None,
            'estado_regla': estado_regla,       # sobre | sub | ok
            'estado_modelo': pred_modelo        # sobre | sub | ok  (si hay modelo entrenado)
        }
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data-dir', required=True, help='Carpeta con los Excel mensuales')
    ap.add_argument('--train', action='store_true')
    ap.add_argument('--predict', action='store_true')
    ap.add_argument('--anio', type=int)
    ap.add_argument('--mes', type=int)
    args = ap.parse_args()

    allm = load_all(args.data_dir)
    monthly = capacidad_optima_por_mes(allm)
    dataset = construir_dataset(monthly)

    if args.train:
        res = entrenar_guardar(dataset, out_path='model.pkl')
        print(json.dumps({'step':'train', 'result': res}, ensure_ascii=False))
        return

    if args.predict:
        pred = proyectar_siguiente(monthly, anio=args.anio, mes=args.mes, model_path='model.pkl')
        print(json.dumps({'step':'predict', 'result': pred}, ensure_ascii=False))
        return

    # si no pasan flags, devolver resumen
    print(json.dumps({
        'step':'summary',
        'monthly': monthly.to_dict(orient='records'),
        'dataset': dataset.to_dict(orient='records')
    }, ensure_ascii=False))

if __name__ == '__main__':
    main()
