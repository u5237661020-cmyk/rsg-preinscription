<?php
// ═══════════════════════════════════════════════════════════════════
// Envoi d'e-mails via le serveur SMTP o2switch (PHPMailer)
// ═══════════════════════════════════════════════════════════════════

declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;

function create_mailer(): PHPMailer
{
    $c = config('smtp') ?: [];
    $transport = strtolower(clean($c['transport'] ?? 'smtp'));
    if ($transport === 'mail' || $transport === 'sendmail') {
        // Envoi par le serveur mail local de l'hébergement (fonction mail() de PHP).
        $mail = new PHPMailer(true);
        $mail->isMail();
        $mail->CharSet = PHPMailer::CHARSET_UTF8;
        $mail->Encoding = PHPMailer::ENCODING_BASE64;
        $fromEmail = clean($c['from_email'] ?? '') ?: clean($c['user'] ?? '');
        if ($fromEmail === '') throw new RuntimeException('Renseignez smtp.from_email dans api/config.php.');
        $mail->Hostname = substr((string)strrchr($fromEmail, '@'), 1) ?: '';
        $mail->Sender = $fromEmail;
        $mail->setFrom($fromEmail, str_replace('"', "'", clean($c['from_name'] ?? '') ?: 'Reveil Saint-Gereon'));
        if (clean($c['reply_to'] ?? '') !== '') $mail->addReplyTo(clean($c['reply_to']));
        return $mail;
    }
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
    try {
        $mail->send();
    } catch (Throwable $e) {
        $msg = $e->getMessage();
        if (stripos($msg, 'connect') !== false) {
            $msg .= ' — Vérifiez smtp.host dans config.php : sur o2switch, mettez le nom du serveur (ex. marbre.o2switch.net) avec le port 465 et secure ssl, ou essayez le port 587 avec secure tls.';
        } elseif (stripos($msg, 'authenticate') !== false) {
            $msg .= ' — Identifiant ou mot de passe de la boîte mail incorrect dans config.php.';
        }
        throw new RuntimeException($msg, 0, $e);
    }
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
