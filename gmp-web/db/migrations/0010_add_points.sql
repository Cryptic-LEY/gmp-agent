-- 积分（游戏货币）字段：用于商店购买道具，与 XP 互不换算
ALTER TABLE user_game_state ADD COLUMN points INTEGER NOT NULL DEFAULT 0;
