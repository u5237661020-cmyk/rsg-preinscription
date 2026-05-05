#!/usr/bin/env python3
"""
Convertit un export Footclubs (.xlsx) en licencies.json pour l'app RSG Préinscription.

Utilisation :
    python3 convert-footclubs.py mon_export.xlsx
    
    -> Génère licencies.json à placer dans le dossier 'public/' du site.

Recolonnes attendues (insensibles à la casse) :
    - Nom
    - Prénom
    - Numéro licence
    - Validité Certif Médic N+1   (ou "Validité Certif Médic N+1_1")
    - Sous catégorie
    - Né(e) le
    - Sexe
    - Type licence
    - Email principal
    - Mobile personnel
    - Email repr légal 1
    - Tel mobile repr légal 1
    - Nom, prénom repr légal 1

Dépendances : pip install pandas openpyxl
"""
import sys
import json
import re
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    print("Installez pandas : pip install pandas openpyxl")
    sys.exit(1)


def map_categorie(sous_cat):
    if not sous_cat or pd.isna(sous_cat):
        return ""
    s = str(sous_cat).strip()
    if re.search(r'dirigeant', s, re.I):
        return "Dirigeant"
    if re.search(r'educateur|éducateur|régional|regional', s, re.I):
        return "Educateur"
    if re.search(r'senior', s, re.I):
        return "Senior"
    if re.search(r'vétéran|veteran', s, re.I):
        return "Vétéran"
    m = re.search(r'U(\d+)', s, re.I)
    if m:
        n = int(m.group(1))
        if n <= 6:   return "U5-U6"
        if n <= 8:   return "U7-U8"
        if n <= 10:  return "U9-U10"
        if n <= 12:  return "U11-U12"
        if n <= 14:  return "U13-U14"
        if n <= 16:  return "U15-U16"
        if n <= 18:  return "U17-U18"
        return "Senior"
    return ""


def besoin_certif(validite):
    if pd.isna(validite):
        return None
    v = str(validite).strip()
    if re.search(r'non\s*valide', v, re.I):
        return True
    if re.search(r'valide', v, re.I):
        return False
    return None


def safe_str(v):
    return "" if pd.isna(v) else str(v).strip()


def safe_phone(v):
    if pd.isna(v):
        return ""
    if isinstance(v, (int, float)):
        try:
            return str(int(v))
        except Exception:
            pass
    return str(v).strip().replace(" ", "")


def find_col(df, *candidates):
    """Trouve une colonne (insensible à la casse, recherche partielle)."""
    cols_lower = {c.lower(): c for c in df.columns}
    for cand in candidates:
        c_low = cand.lower()
        # Match exact d'abord
        if c_low in cols_lower:
            return cols_lower[c_low]
        # Sinon recherche partielle
        for k, v in cols_lower.items():
            if c_low in k:
                return v
    return None


def convert(xlsx_path):
    df = pd.read_excel(xlsx_path)
    print(f"📊 {len(df)} lignes lues dans {xlsx_path}")

    col_nom        = find_col(df, "Nom") or "Nom"
    col_prenom     = find_col(df, "Prénom", "Prenom")
    col_num        = find_col(df, "Numéro licence", "Numero licence")
    col_validite   = find_col(df, "Validité Certif Médic N+1_1", "Validité Certif Médic N+1", "Validite Certif Medic N+1")
    col_souscat    = find_col(df, "Sous catégorie", "Sous categorie")
    col_naiss      = find_col(df, "Né(e) le", "Ne(e) le", "Date de naissance")
    col_sexe       = find_col(df, "Sexe")
    col_typeLic    = find_col(df, "Type licence")
    col_email      = find_col(df, "Email principal")
    col_tel        = find_col(df, "Mobile personnel")
    col_emailRl    = find_col(df, "Email repr légal 1", "Email repr legal 1")
    col_telRl      = find_col(df, "Tel mobile repr légal 1", "Tel mobile repr legal 1")
    col_nomRl      = find_col(df, "Nom, prénom repr légal 1", "Nom prenom repr legal 1")

    print("\n🔍 Colonnes détectées :")
    for label, val in [("Nom", col_nom), ("Prénom", col_prenom), ("Num licence", col_num),
                        ("Validité N+1", col_validite), ("Sous catégorie", col_souscat),
                        ("Naissance", col_naiss), ("Email", col_email)]:
        print(f"  {label:<18} : {val or '(non trouvée)'}")

    if not col_validite:
        print("\n⚠️  ATTENTION : la colonne 'Validité Certif Médic N+1' n'a pas été trouvée.")
        print("   Le champ 'cm' sera null pour tous les licenciés.")

    records = []
    for _, row in df.iterrows():
        sous_cat = row.get(col_souscat) if col_souscat else None
        cat = map_categorie(sous_cat)

        naiss = row.get(col_naiss) if col_naiss else None
        naiss_iso = ""
        if pd.notna(naiss):
            try:
                # format dd/mm/yyyy
                m = re.match(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})', str(naiss))
                if m:
                    naiss_iso = f"{m.group(3).zfill(4)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
                elif hasattr(naiss, 'strftime'):
                    naiss_iso = naiss.strftime("%Y-%m-%d")
            except Exception:
                pass

        num_lic = ""
        if col_num and pd.notna(row.get(col_num)):
            try:
                num_lic = str(int(row[col_num]))
            except Exception:
                num_lic = str(row[col_num])

        rec = {
            "n":  safe_str(row.get(col_nom)).upper() if col_nom else "",
            "p":  safe_str(row.get(col_prenom)) if col_prenom else "",
            "l":  num_lic,
            "c":  cat,
            "sc": safe_str(sous_cat),
            "tl": safe_str(row.get(col_typeLic)) if col_typeLic else "",
            "dn": naiss_iso,
            "s":  safe_str(row.get(col_sexe)) if col_sexe else "",
            "cm": besoin_certif(row.get(col_validite)) if col_validite else None,
            "em": safe_str(row.get(col_email)) if col_email else "",
            "tel": safe_phone(row.get(col_tel)) if col_tel else "",
            "em2": safe_str(row.get(col_emailRl)) if col_emailRl else "",
            "tel2": safe_phone(row.get(col_telRl)) if col_telRl else "",
            "rl": safe_str(row.get(col_nomRl)) if col_nomRl else "",
        }
        rec = {k: v for k, v in rec.items() if v not in ("", None) or k == "cm"}
        records.append(rec)

    # Stats
    print(f"\n✅ {len(records)} licenciés convertis")
    requis = sum(1 for r in records if r.get("cm") is True)
    valides = sum(1 for r in records if r.get("cm") is False)
    inconnus = sum(1 for r in records if r.get("cm") is None)
    print(f"   🩺 Certif requis pour la prochaine saison : {requis}")
    print(f"   ✅ Certif valide pour la prochaine saison  : {valides}")
    print(f"   ❓ Inconnu                                 : {inconnus}")

    from datetime import date
    output = {
        "saison": str(date.today().year - (1 if date.today().month < 7 else 0)) + "-" + str(date.today().year + (0 if date.today().month < 7 else 1)),
        "source": f"Footclubs - {Path(xlsx_path).name}",
        "dateImport": date.today().isoformat(),
        "licencies": records,
    }

    out_path = Path(xlsx_path).parent / "licencies.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=1)

    size_kb = out_path.stat().st_size / 1024
    print(f"\n💾 Fichier généré : {out_path} ({size_kb:.1f} Ko)")
    print(f"\n🚀 Étapes suivantes :")
    print(f"   1. Copiez {out_path.name} dans le dossier public/ de votre projet")
    print(f"   2. Lancez UPDATE-WINDOWS.bat (ou la version Mac)")
    print(f"   3. Le site sera mis à jour avec la nouvelle base en 1 minute")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Utilisation : python3 convert-footclubs.py <fichier.xlsx>")
        sys.exit(1)
    convert(sys.argv[1])
