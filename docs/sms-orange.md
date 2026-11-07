# Connexion par numéro (SMS Orange) : mise en service

La révision accepte deux moyens de connexion, sans mot de passe :

- **e-mail** : lien et code à 6 chiffres (inchangé) ;
- **numéro** (mobile du Sénégal, Orange, Free ou Expresso) : code à 6 chiffres par SMS.

L'envoi des SMS passe par l'API **SMS Africa & Middle East 2.0** d'Orange (developer.orange.com) :

```
App (signInWithOtp({ phone }))
  → Supabase Auth (crée le code)
  → Send SMS hook (requête signée)
  → fonction Edge supabase/functions/send-sms
  → API SMS d'Orange (expéditeur tel:+2210000)
```

Tant que les étapes ci-dessous ne sont pas faites, l'onglet « NUMÉRO » affiche : « La connexion par numéro n'est pas encore disponible. Utilisez votre adresse e-mail. »

## 1. Côté Orange Developer

1. Créez une app et associez-lui l'API **SMS Africa & Middle East**, pays **Sénégal**.
2. Demandez le nom d'expéditeur **XamXamBey** à l'équipe locale (formulaire de contact du portail). Contraintes : 11 caractères au plus, lettres, chiffres et espaces seulement. Depuis juin 2026, cette validation débloque l'achat des forfaits.
3. Achetez le **Starter bundle**, puis un forfait adapté au volume.
4. Notez l'identifiant (client ID) et la clé secrète (client secret) de l'app, dans **MyApps**. Ne les mettez jamais dans le dépôt.

## 2. Côté Supabase (projet de production)

1. **Déployer la fonction** (la vérification JWT est coupée par `supabase/config.toml` : le hook s'authentifie par sa signature) :
   ```sh
   supabase functions deploy send-sms
   ```
2. **Créer le hook** : Authentication > Hooks > **Send SMS hook**.
   - Type : HTTPS.
   - URL : `https://<ref-du-projet>.supabase.co/functions/v1/send-sms`.
   - Générez le secret (format `v1,whsec_…`) et copiez-le.
3. **Enregistrer les secrets de la fonction** :
   ```sh
   supabase secrets set SEND_SMS_HOOK_SECRET='v1,whsec_…' ORANGE_CLIENT_ID='…' ORANGE_CLIENT_SECRET='…' ORANGE_SENDER_NAME='XamXamBey'
   ```
   `ORANGE_SENDER_NAME` est facultatif. Ne le renseignez qu'une fois le nom approuvé par Orange : un nom non approuvé fait échouer chaque envoi (400 requestError).
4. **Activer le téléphone** : Authentication > Sign In / Providers > **Phone**. Autorisez les inscriptions par téléphone. Le hook remplace le fournisseur SMS choisi.
5. **Limiter les abus** : chaque SMS est payé.
   - Authentication > Rate Limits : nombre de SMS par heure, réglé sur le budget.
   - Captcha : recommandé.
   - La fonction refuse déjà tout numéro hors Sénégal : pas d'envoi vers des numéros surtaxés à l'étranger.

## 3. Vérifier

1. Connectez-vous avec un numéro **Orange**, puis un numéro **Free** et un numéro **Expresso**, pour confirmer la livraison vers tous les opérateurs.
2. En cas d'échec, consultez Edge Functions > send-sms > Logs. Les messages commencent par `[send-sms]`. Causes possibles : solde épuisé, contrat expiré, nom d'expéditeur non approuvé, secret du hook incorrect (401).

## Local et tests

- Pile locale (`supabase start`) : aucun SMS n'est envoyé. Le numéro de test **77 000 00 01** reçoit toujours le code **123456** (`[auth.sms.test_otp]`). Le bloc Twilio de `config.toml` porte des valeurs factices qui ne servent qu'à ouvrir la connexion par numéro en local.
- Tests unitaires de la fonction : `supabase/functions/send-sms/orange.test.ts` (lancés par `npm test`).
- Test de bout en bout : `e2e/signin-phone.spec.ts`.
- Base : `supabase/tests/12_admin_scout_phone_test.sql`. La recherche admin trouve un compte par une partie de son numéro.

## Limites connues

- **Deux moyens, deux comptes** : un élève inscrit par e-mail qui se connecte ensuite par numéro obtient un second compte, avec une progression séparée. Une liaison du numéro à un compte existant reste à faire.
- **Admins** : ce sont toujours des comptes e-mail (`public.admins`, `is_admin`). Un compte créé avec un numéro seul ne peut pas être admin.
