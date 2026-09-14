import LegalPage from './LegalPage'

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="2026-09-14">
      <h3>Who we are</h3>
      <p>
        Paddy's Pastures is a horse boarding facility. We operate a web portal at
        app.paddyspastures.com for our boarders, staff, and management. Contact
        us at (941) 442-5648 or{' '}
        <a href="mailto:Howdy@paddyspastures.com">Howdy@paddyspastures.com</a>.
      </p>

      <h3>What we collect</h3>
      <p>
        When an account is created for you, we collect your name, email address,
        mailing address, and mobile phone number. If you board a horse with us,
        we collect information about your horse, including care details,
        photographs, and veterinary or medical records you choose to upload. We
        also store messages you send through the portal.
      </p>

      <h3>Why we collect it</h3>
      <p>
        To manage your account, care for your horse, keep records required for
        boarding, and communicate with you about the barn.
      </p>

      <h3>Mobile numbers and SMS</h3>
      <p>
        If you opt in to text notifications, we use your mobile number only to
        send the messages described in our <a href="/sms-terms">SMS Terms</a>.{' '}
        <strong>
          No mobile information will be shared with third parties or affiliates
          for marketing or promotional purposes.
        </strong>{' '}
        Text messaging originator opt-in data and consent are not shared with any
        third party except the messaging provider that delivers the messages on
        our behalf.
      </p>

      <h3>Who we share information with</h3>
      <p>
        We do not sell your information. We share it only with service providers
        who operate the portal for us: our hosting and database providers, our
        email provider, and our SMS provider. Each processes your information
        solely to provide that service. We may also disclose information if
        required by law.
      </p>

      <h3>How long we keep it</h3>
      <p>
        We retain account and horse records for as long as you board with us and
        afterward as needed for our business and legal records.
      </p>

      <h3>Security</h3>
      <p>
        Access to information in the portal is restricted by role and enforced at
        the database level. Medical records are stored privately and are not
        publicly accessible.
      </p>

      <h3>Your choices</h3>
      <p>
        You can view and update your account information in the portal. You can
        turn off text notifications at any time by replying STOP, changing your
        account settings, or contacting us. To request a copy or deletion of your
        information, contact us using the details above.
      </p>

      <h3>Children</h3>
      <p>
        The portal is not directed to children under 13 and we do not knowingly
        collect information from them.
      </p>

      <h3>Changes</h3>
      <p>
        We may update this policy. The current version is always posted here.
      </p>
    </LegalPage>
  )
}