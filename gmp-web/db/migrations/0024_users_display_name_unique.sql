SET @duplicate_display_name_count = (
  SELECT COUNT(*)
  FROM (
    SELECT display_name
    FROM users
    GROUP BY display_name
    HAVING COUNT(*) > 1
  ) duplicate_display_names
);

SET @display_name_index_count = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND index_name = 'users_display_name_unique'
);

SET @add_display_name_unique_sql = IF(
  @duplicate_display_name_count = 0 AND @display_name_index_count = 0,
  'ALTER TABLE users ADD UNIQUE KEY users_display_name_unique (display_name)',
  'SELECT 1'
);

PREPARE add_display_name_unique_stmt FROM @add_display_name_unique_sql;
EXECUTE add_display_name_unique_stmt;
DEALLOCATE PREPARE add_display_name_unique_stmt;
