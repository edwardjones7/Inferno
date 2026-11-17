/*
 * DRAFT: NOT LEGAL ADVICE. These terms are a working draft. Have a lawyer review them before
 * launch, in particular the simulated-gambling and play-money wording, the subscription terms
 * (check them against Apple's and Google's current requirements), the liability limits and the
 * governing law, which vary by country.
 *
 * Placeholders to fill in before publishing:
 *   [COMPANY NAME]   the legal entity that publishes the app
 *   [CONTACT EMAIL]  a monitored support address
 *   [JURISDICTION]   governing law and courts
 *
 * Membership prices are deliberately not listed here: the stores show the current price before
 * purchase, and it changes with introductory offers and region.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Ext, LegalPage, List, Section } from "../legal-page";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated="[DATE]"
      intro={
        <>
          <p>
            These terms are an agreement between you and [COMPANY NAME] (&ldquo;we&rdquo;) for using Inferno, on the web and in the iOS and
            Android apps. By using Inferno you accept them. If you don&rsquo;t, please don&rsquo;t use the app.
          </p>
          <p className="mt-3 font-semibold text-bone">
            Inferno is a training game. There is no real-money gambling, and chips have no cash value.
          </p>
        </>
      }
    >
      <Section title="Age">
        <p>You must be at least 18 years old, and old enough to play casino games in a simulated setting where you live, to use Inferno.</p>
      </Section>

      <Section title="Simulated gambling only">
        <List>
          <li>Every game in Inferno is a simulation for practice and entertainment. You can&rsquo;t bet or win real money, prizes or anything of value.</li>
          <li>Inferno doesn&rsquo;t offer, promote or link to real-money gambling.</li>
          <li>
            Doing well in Inferno doesn&rsquo;t mean you will do well at real-money gambling. If you gamble for real, set limits you can afford
            to lose. If gambling stops being fun, organizations such as{" "}
            <Ext href="https://www.ncpgambling.org/help-treatment/">the National Council on Problem Gambling</Ext> (US) and{" "}
            <Ext href="https://www.begambleaware.org/">BeGambleAware</Ext> (UK) can help.
          </li>
        </List>
      </Section>

      <Section title="Chips are play money">
        <List>
          <li>Chips are a play-money balance inside the app. They have no cash value and are not your property.</li>
          <li>Chips can&rsquo;t be cashed out, sold, transferred to another person or exchanged for money, goods or anything of value, in or outside the app.</li>
          <li>We may change how chips are earned or used, reset balances, or remove chips gained through bugs or cheating.</li>
          <li>Chips are stored on your device. If you delete the app or its data, they are gone, and we can&rsquo;t restore them.</li>
        </List>
      </Section>

      <Section title="Training content is not a guarantee">
        <p>
          The lessons, coach, drills, charts and bots teach widely accepted strategy under stated assumptions (rules, stack depths, positions).
          They are educational, not financial or professional advice. Real games vary, and no strategy guarantees winnings. You are responsible
          for any decisions you make at a real table.
        </p>
      </Section>

      <Section title="Memberships and subscriptions">
        <List>
          <li>
            Memberships are sold as auto-renewing subscriptions through the Apple App Store or Google Play, and payment is charged to your store
            account when you confirm the purchase. The price and billing period are shown before you buy.
          </li>
          <li>
            A subscription renews automatically at the end of each period, at the then-current price, unless you cancel at least 24 hours before
            the period ends.
          </li>
          <li>
            If a free trial is offered, it converts to a paid subscription when the trial ends unless you cancel at least 24 hours before it
            ends. Any unused part of a trial is forfeited when you buy a subscription, where the store applies this.
          </li>
          <li>
            Cancel or manage your subscription in your App Store account settings (iPhone: Settings → your name → Subscriptions) or in Google Play
            (Play Store → Payments &amp; subscriptions → Subscriptions). Deleting the app does not cancel it.
          </li>
          <li>
            Refunds are handled by Apple or Google under their policies; we can&rsquo;t issue them directly. Request one through{" "}
            <Ext href="https://reportaproblem.apple.com/">Apple</Ext> or{" "}
            <Ext href="https://support.google.com/googleplay/answer/2479637">Google Play</Ext>.
          </li>
          <li>
            Membership benefits (such as no ads, extra content and chip grants) may change over time. If we remove a major benefit, we&rsquo;ll
            tell you in the app first.
          </li>
          <li>Free play, lessons and drills stay available without a membership.</li>
        </List>
      </Section>

      <Section title="Ads">
        <p>
          The free version of the apps shows ads, and anyone can choose to watch an ad for chips. Rewards are granted only when the ad network
          confirms the ad was completed. How ads use data is described in the{" "}
          <Link href="/legal/privacy/" className="font-semibold text-ember-300 underline underline-offset-2">
            privacy policy
          </Link>
          .
        </p>
      </Section>

      <Section title="Fair use">
        <p>
          Don&rsquo;t reverse engineer, resell or misuse the app, interfere with ads or purchases, or use it to break any law. Inferno&rsquo;s
          software, artwork, bots and training content belong to [COMPANY NAME] and its licensors. We grant you a personal, non-transferable
          licence to use the app for your own entertainment and learning. If you buy through the App Store, Apple&rsquo;s standard licensed
          application end user licence agreement also applies.
        </p>
      </Section>

      <Section title="No warranty; limitation of liability">
        <p>
          Inferno is provided &ldquo;as is&rdquo;. We work to keep it correct and available, but we don&rsquo;t promise it will be error-free or
          that progress stored on your device can&rsquo;t be lost. To the extent the law allows, we aren&rsquo;t liable for indirect or
          consequential losses, or for losses from gambling you do outside the app. Nothing in these terms limits rights you have as a consumer
          that can&rsquo;t be excluded by law.
        </p>
      </Section>

      <Section title="Changes and ending">
        <p>
          We may update these terms; the date at the top shows the latest version, and significant changes will be announced in the app. You can
          stop using Inferno at any time. We may suspend features or end the service; if we end it, we&rsquo;ll give reasonable notice where we
          can.
        </p>
      </Section>

      <Section title="Governing law and contact">
        <p>
          These terms are governed by the laws of [JURISDICTION], except where the law of your country of residence gives you protections that
          can&rsquo;t be overridden. Questions: [CONTACT EMAIL].
        </p>
      </Section>
    </LegalPage>
  );
}
