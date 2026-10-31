<?php
// ═══════════════════════════════════════════════════════════════════
// Envoi d'e-mails via le serveur SMTP o2switch (PHPMailer)
// ═══════════════════════════════════════════════════════════════════

declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;

function create_mailer(): PHPMailer
{
    $c = config('smtp') ?: [];
    $user = clean($c['user'] ?? '');
    $pass = (string)($c['password'] ?? '');
    $auth = ($c['auth'] ?? true) !== false;
    if ($auth && ($user === '' || $pass === '' || str_starts_with($pass, 'MOT_DE_PASSE'))) {
        throw new RuntimeException('Configuration SMTP manquante : renseignez la section smtp de api/config.php.');
    }
    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = clean($c['host'] ?? 'localhost');
    $mail->Port = (int)($c['port'] ?? 465);
    $mail->SMTPAuth = $auth;
    $mail->Username = $user;
    $mail->Password = $pass;
    $secure = strtolower(clean($c['secure'] ?? 'ssl'));
    $mail->SMTPAutoTLS = $secure !== 'none';
    $mail->SMTPSecure = $secure === 'tls' ? PHPMailer::ENCRYPTION_STARTTLS : ($secure === '' || $secure === 'none' ? '' : PHPMailer::ENCRYPTION_SMTPS);
    $mail->SMTPKeepAlive = true;
    $mail->CharSet = PHPMailer::CHARSET_UTF8;
    $mail->Encoding = PHPMailer::ENCODING_BASE64;
    $mail->Timeout = 30;
    $fromEmail = clean($c['from_email'] ?? '') ?: $user;
    $fromName = clean($c['from_name'] ?? '') ?: 'Reveil Saint-Gereon';
    $mail->Hostname = substr((string)strrchr($fromEmail, '@'), 1) ?: '';
    $mail->setFrom($fromEmail, str_replace('"', "'", $fromName));
    if (clean($c['reply_to'] ?? '') !== '') $mail->addReplyTo(clean($c['reply_to']));
    return $mail;
}

/**
 * Envoie un message. $attachments : liste de ['filename','content'(binaire),'contentType'].
 * Retourne l'identifiant du message.
 */
function send_mail(PHPMailer $mail, string $to, string $subject, string $html, string $text, array $attachments = []): string
{
    $mail->clearAddresses();
    $mail->clearAttachments();
    $mail->addAddress($to);
    $mail->Subject = $subject;
    $mail->isHTML(true);
    $mail->Body = $html;
    $mail->AltBody = $text;
    foreach ($attachments as $file) {
        $mail->addStringAttachment($file['content'], $file['filename'], PHPMailer::ENCODING_BASE64, $file['contentType'] ?? 'application/octet-stream');
    }
    $mail->MessageID = '';
    $mail->send();
    return $mail->getLastMessageID();
}

function send_one_mail(string $to, string $subject, string $html, string $text, array $attachments = []): string
{
    $mail = create_mailer();
    try {
        return send_mail($mail, $to, $subject, $html, $text, $attachments);
    } finally {
        $mail->smtpClose();
    }
}
