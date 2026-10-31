<?php
// ═══════════════════════════════════════════════════════════════════
// Génération du PDF d'attestation de licence (FPDF)
// Mise en page reprise de l'ancienne version (pdfkit, A4, points).
// ═══════════════════════════════════════════════════════════════════

declare(strict_types=1);

final class AttestationPdf extends FPDF
{
    public function setCellMargin(float $m): void
    {
        $this->cMargin = $m;
    }

    public function roundedRect(float $x, float $y, float $w, float $h, float $r, string $style = ''): void
    {
        $k = $this->k;
        $hp = $this->h;
        $op = $style === 'F' ? 'f' : ($style === 'FD' || $style === 'DF' ? 'B' : 'S');
        $myArc = 4 / 3 * (sqrt(2) - 1);
        $this->_out(sprintf('%.2F %.2F m', ($x + $r) * $k, ($hp - $y) * $k));
        $xc = $x + $w - $r; $yc = $y + $r;
        $this->_out(sprintf('%.2F %.2F l', $xc * $k, ($hp - $y) * $k));
        $this->arc($xc + $r * $myArc, $yc - $r, $xc + $r, $yc - $r * $myArc, $xc + $r, $yc);
        $xc = $x + $w - $r; $yc = $y + $h - $r;
        $this->_out(sprintf('%.2F %.2F l', ($x + $w) * $k, ($hp - $yc) * $k));
        $this->arc($xc + $r, $yc + $r * $myArc, $xc + $r * $myArc, $yc + $r, $xc, $yc + $r);
        $xc = $x + $r; $yc = $y + $h - $r;
        $this->_out(sprintf('%.2F %.2F l', $xc * $k, ($hp - ($y + $h)) * $k));
        $this->arc($xc - $r * $myArc, $yc + $r, $xc - $r, $yc + $r * $myArc, $xc - $r, $yc);
        $xc = $x + $r; $yc = $y + $r;
        $this->_out(sprintf('%.2F %.2F l', $x * $k, ($hp - $yc) * $k));
        $this->arc($xc - $r, $yc - $r * $myArc, $xc - $r * $myArc, $yc - $r, $xc, $yc - $r);
        $this->_out($op);
    }

    private function arc(float $x1, float $y1, float $x2, float $y2, float $x3, float $y3): void
    {
        $h = $this->h;
        $this->_out(sprintf('%.2F %.2F %.2F %.2F %.2F %.2F c', $x1 * $this->k, ($h - $y1) * $this->k, $x2 * $this->k, ($h - $y2) * $this->k, $x3 * $this->k, ($h - $y3) * $this->k));
    }
}

/** Convertit l'UTF-8 vers le jeu de caractères des polices standard PDF (Windows-1252). */
function pdf_txt(string $s): string
{
    $out = @iconv('UTF-8', 'Windows-1252//TRANSLIT', $s);
    return $out === false ? utf8_decode_fallback($s) : $out;
}

function utf8_decode_fallback(string $s): string
{
    return mb_convert_encoding($s, 'ISO-8859-1', 'UTF-8');
}

function pdf_hex(AttestationPdf $pdf, string $hex, string $what): void
{
    [$r, $g, $b] = sscanf(ltrim($hex, '#'), '%02x%02x%02x');
    match ($what) {
        'fill' => $pdf->SetFillColor($r, $g, $b),
        'draw' => $pdf->SetDrawColor($r, $g, $b),
        default => $pdf->SetTextColor($r, $g, $b),
    };
}

/**
 * Écrit du texte à la position (x, y) = coin haut-gauche, comme pdfkit.
 * $width null = une ligne ; sinon paragraphe justifié à gauche.
 */
function pdf_text(AttestationPdf $pdf, string $text, float $x, float $y, float $size, ?float $width = null, string $align = 'L', float $lineGap = 0): void
{
    $lineH = $size * 1.157 + $lineGap; // hauteur de ligne pdfkit (Helvetica) + interligne
    $pdf->SetXY($x, $y);
    if ($width === null) {
        $pdf->Cell($pdf->GetStringWidth(pdf_txt($text)) + 2, $lineH, pdf_txt($text), 0, 0, 'L');
    } else {
        $pdf->MultiCell($width, $lineH, pdf_txt($text), 0, $align);
    }
}

function asset_path(string $name): string
{
    return dirname(__DIR__) . '/assets/' . $name;
}

function create_attestation_pdf(array $entry): string
{
    $pdf = new AttestationPdf('P', 'pt', 'A4');
    $pdf->SetMargins(0, 0, 0);
    $pdf->SetAutoPageBreak(false);
    $pdf->setCellMargin(0);
    $pdf->AddPage();

    $yellow = '#F5C800';
    $dark = '#111827';
    $left = 24.0;
    $contentWidth = $pdf->GetPageWidth() - 48;
    $now = format_date(now_iso());
    $datePaiement = format_date(js_or($entry['datePaiement'] ?? null, $entry['dateValidation'] ?? null, now_iso()));
    $fullName = trim(clean($entry['prenom'] ?? '') . ' ' . clean($entry['nom'] ?? ''));
    $saison = clean($entry['saison'] ?? '');
    $categorie = clean($entry['categorie'] ?? '');
    $montant = js_str(js_or($entry['prixFinal'] ?? null, $entry['tarifBase'] ?? null, 0));

    $pdf->SetTitle('Attestation licence RSG - ' . $fullName, true);
    $pdf->SetAuthor('Reveil Saint-Gereon', true);

    try { $pdf->Image(asset_path('rsg-logo.png'), $left, 22, 48, 48); } catch (Throwable) {}

    pdf_hex($pdf, $dark, 'text');
    $pdf->SetFont('Helvetica', 'B', 15);
    pdf_text($pdf, 'RÉVEIL SAINT-GÉRÉON', $left + 62, 29, 15);
    $pdf->SetFont('Helvetica', '', 11);
    pdf_text($pdf, "Attestation de licence · Saison {$saison}", $left + 62, 48, 11);

    pdf_hex($pdf, $yellow, 'draw');
    $pdf->SetLineWidth(4);
    $pdf->Line($left, 86, $left + $contentWidth, 86);

    pdf_hex($pdf, '#000000', 'text');
    $pdf->SetFont('Helvetica', 'B', 18);
    pdf_text($pdf, "Attestation de règlement et d'inscription", $left, 116, 18);

    $boxY = 158;
    pdf_hex($pdf, '#111111', 'draw');
    $pdf->SetLineWidth(1.4);
    $pdf->roundedRect($left, $boxY, $contentWidth, 118, 8, 'D');
    $pdf->SetFont('Helvetica', '', 12);
    $intro = "Le club Réveil Saint-Géréon atteste que {$fullName}, né(e) le " . format_date($entry['dateNaissance'] ?? '') . ", est enregistré(e) pour la saison {$saison} en catégorie {$categorie}.";
    pdf_text($pdf, $intro, $left + 18, $boxY + 23, 12, $contentWidth - 36, 'L', 4);
    pdf_text($pdf, 'Le règlement de la licence est indiqué comme reçu par le secrétariat du club.', $left + 18, $boxY + 78, 12, $contentWidth - 36);

    $metaY = 314;
    pdf_hex($pdf, '#F9FAFB', 'fill');
    $pdf->roundedRect($left, $metaY, $contentWidth, 72, 8, 'F');
    pdf_hex($pdf, '#000000', 'text');
    $pdf->SetFont('Helvetica', '', 10.5);
    pdf_text($pdf, 'Référence dossier : ' . js_str($entry['id'] ?? ''), $left + 14, $metaY + 14, 10.5);
    pdf_text($pdf, "Date de paiement : {$datePaiement}", $left + 14, $metaY + 30, 10.5);
    pdf_text($pdf, "Montant licence : {$montant} €", $left + 14, $metaY + 46, 10.5);

    $sigY = 468;
    $pdf->SetFont('Helvetica', '', 12);
    pdf_text($pdf, "Fait à Saint-Géréon, le {$now}", $left, $sigY, 12);
    pdf_text($pdf, 'Pour le Réveil Saint-Géréon', $left + 305, $sigY, 12);
    try {
        $pdf->Image(asset_path('rsg-signature.png'), $left + 332, $sigY + 28, 220);
    } catch (Throwable) {
        pdf_text($pdf, 'Signature', $left + 390, $sigY + 42, 12);
    }

    pdf_hex($pdf, '#6b7280', 'text');
    $pdf->SetFont('Helvetica', '', 9);
    pdf_text($pdf, 'Document généré automatiquement par le secrétariat du Réveil Saint-Géréon.', $left, 760, 9, $contentWidth, 'C');

    return $pdf->Output('S');
}
