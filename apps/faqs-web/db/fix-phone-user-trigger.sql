-- 修复：支持手机号用户创建 profile
-- 在 Supabase Dashboard → SQL Editor 中执行此脚本

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, avatar)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'full_name',
      CASE WHEN NEW.email IS NOT NULL THEN split_part(NEW.email, '@', 1) ELSE NULL END,
      CASE WHEN NEW.phone IS NOT NULL THEN '手机用户' ELSE '用户' END
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
