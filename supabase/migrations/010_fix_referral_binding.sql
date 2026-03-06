-- =============================================
-- 010: Fix referral binding + require referral code for new users
-- 1. Allow existing users to bind referrer if not yet bound
-- 2. New users MUST provide a valid referral code to register
-- =============================================

CREATE OR REPLACE FUNCTION auth_wallet(addr TEXT, ref_code TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result profiles%ROWTYPE;
  referrer_profile profiles%ROWTYPE;
BEGIN
  SELECT * INTO result FROM profiles WHERE wallet_address = addr;

  -- Resolve referrer if ref_code provided
  IF ref_code IS NOT NULL AND ref_code != '' THEN
    SELECT * INTO referrer_profile FROM profiles WHERE profiles.ref_code = auth_wallet.ref_code;
  END IF;

  IF result.id IS NOT NULL THEN
    -- Existing user: bind referrer if not yet bound and referrer is valid
    IF result.referrer_id IS NULL AND referrer_profile.id IS NOT NULL AND referrer_profile.id != result.id THEN
      UPDATE profiles SET referrer_id = referrer_profile.id WHERE id = result.id
      RETURNING * INTO result;
    END IF;
    RETURN to_jsonb(result);
  END IF;

  -- New user: require valid referral code
  IF referrer_profile.id IS NULL THEN
    RETURN jsonb_build_object('error', 'REFERRAL_REQUIRED', 'message', 'A valid referral code is required to register');
  END IF;

  INSERT INTO profiles (wallet_address, referrer_id)
  VALUES (addr, referrer_profile.id)
  RETURNING * INTO result;

  RETURN to_jsonb(result);
END;
$$;
