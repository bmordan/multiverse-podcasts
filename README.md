# Podcasts at Multiverse

## Migration
Create the DB
```sh
mysql -u root --password=$MYSQL_ROOT_PASSWORD
```
```sql
CREATE DATABASE podcasts;
```
Create a user for the app
```sql
CREATE USER $PODCASTS_MYSQL_USER IDENTIFIED BY $PODCASTS_MYSQL_PASSWORD;
```
Grant permissions
```sql
GRANT ALL privileges ON `mydb`.* TO 'myuser'@localhost;
```
Body size Nginx
```
etc/nginx/conf.d/client_max_body_size.conf
client_max_body_size 1g;
```