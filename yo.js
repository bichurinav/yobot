const { VK, API, Keyboard } = require('vk-io');
const mysql = require('mysql2/promise');

const groupToken =
    '401f26eb365aa3f630db474e30371a5b39c464967d7476c4c4201b04836218730e89aa84243627a4c1ee5';
const serviceToken =
    '274e217d274e217d274e217df62736207b2274e274e217d47e0a4f95c25e42372c81f5a';

async function start() {
    try {
        // DATABASE
        const db = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '1097',
            database: 'yo',
        });
        const vk = new VK({
            token: groupToken,
            apiMode: 'parallel',
        });
        const groupAPI = new API({
            token: groupToken,
        });
        const serviceAPI = new API({
            token: serviceToken,
        });
        const initialButton = Keyboard.keyboard([
            [
                Keyboard.textButton({
                    label: 'Yo',
                    payload: {
                        command: 'getYoList',
                    },
                    color: Keyboard.POSITIVE_COLOR,
                }),
            ],
        ]);
        // COMMANDS
        async function getYoList(ctx, flag = false) {
            try {
                const sender = await getUser(ctx.senderId);
                const friends = JSON.parse(sender.friends);
                if (friends.length < 1) {
                    return ctx.send(
                        `Вы не добавили друзей в список! \n Отправьте ссылку на страницу друга`
                    );
                }

                const arrBtnFriends = friends.map((el) => {
                    return [
                        Keyboard.textButton({
                            label: el.first_name + ' ' + el.last_name,
                            payload: {
                                command: 'sendYo',
                                body: el.id,
                            },
                            color: Keyboard.SECONDARY_COLOR,
                        }),
                    ];
                });

                if (flag) return friends;

                ctx.send({
                    message: 'Выберите друга для отпраки Yo',
                    keyboard: Keyboard.keyboard([...arrBtnFriends]),
                });
            } catch (e) {
                console.error(e);
            }
        }
        async function sendYo(ctx) {
            try {
                const { body } = ctx.messagePayload;
                const dropUser = await getUser(body);
                const dropUserFriends = JSON.parse(dropUser.friends);
                const existFriend = dropUserFriends.find(
                    (el) => el.id === ctx.senderId
                );

                if (!existFriend)
                    return ctx.send('Этот друг вас не добавил в список :(');

                await groupAPI.messages.send({
                    user_id: body,
                    message: `Yo - ${existFriend.first_name} ${existFriend.last_name}`,
                    random_id: 0,
                });

                const friends = await getYoList(ctx, true);

                const keyboardAfterSend = friends.map((el) => {
                    if (el.id === body) {
                        return [
                            Keyboard.textButton({
                                label: 'Yo отправлено!',
                                payload: {
                                    command: 'cancel',
                                },
                                color: Keyboard.NEGATIVE_COLOR,
                            }),
                        ];
                    } else {
                        return [
                            Keyboard.textButton({
                                label: el.first_name + ' ' + el.last_name,
                                payload: {
                                    command: 'sendYo',
                                    body: el.id,
                                },
                                color: Keyboard.SECONDARY_COLOR,
                            }),
                        ];
                    }
                });
                const keyboardReturn = friends.map((el) => {
                    return [
                        Keyboard.textButton({
                            label: el.first_name + ' ' + el.last_name,
                            payload: {
                                command: 'sendYo',
                                body: el.id,
                            },
                            color: Keyboard.SECONDARY_COLOR,
                        }),
                    ];
                });

                await ctx.send({
                    keyboard: Keyboard.keyboard([...keyboardAfterSend]),
                    message: '📬',
                });
                setTimeout(async () => {
                    await ctx.send({
                        keyboard: Keyboard.keyboard([...keyboardReturn]),
                        message: '📄',
                    });
                }, 4000);
            } catch (e) {
                console.error(e);
            }
        }
        // Получить пользователя из базы данных
        async function getUser(senderID) {
            try {
                let [user] = await db.execute(
                    `SELECT * from users WHERE user = ?`,
                    [senderID]
                );
                if (user.length < 1) {
                    await db.execute(
                        `INSERT INTO users (user, friends) VALUES (?, ?)`,
                        [senderID, JSON.stringify([])]
                    );
                    [user] = await db.execute(
                        `SELECT * from users WHERE user = ?`,
                        [senderID]
                    );
                }
                return user[0];
            } catch (e) {
                console.error(e);
            }
        }
        // MESSAGES
        vk.updates.on('message_new', async (ctx) => {
            const msg = ctx.text;
            const button = ctx.hasMessagePayload;
            if (button) {
                switch (ctx.messagePayload.command) {
                    case 'start':
                        await ctx.send({
                            message: '🤖',
                            keyboard: initialButton,
                        });
                        break;
                    case 'getYoList':
                        await getYoList(ctx);
                        break;
                    case 'sendYo':
                        await sendYo(ctx);
                    default:
                        return;
                }
            }
            if (/^начать$/i.test(msg)) {
                await ctx.send({
                    message: '🤖',
                    keyboard: initialButton,
                });
            }
            // Добавление друга в базу данных
            const vkLink = msg.match(/http(s):\/\/vk\.com\//);
            if (vkLink) {
                const screenName = msg.split(vkLink[0])[1];
                const [dropUser] = await groupAPI.users.get({
                    user_ids: screenName,
                });
                if (dropUser.id) {
                    if (dropUser.id === ctx.senderId)
                        return ctx.send('Вы не можете себя добавить :)');
                    const sender = await getUser(ctx.senderId);
                    let friends = JSON.parse(sender.friends);
                    const existFriend = friends.find(
                        (el) => el.id === dropUser.id
                    );
                    if (existFriend)
                        return ctx.send('Вы уже добавили этого друга :)');
                    friends = [
                        ...friends,
                        {
                            id: dropUser.id,
                            first_name: dropUser.first_name,
                            last_name: dropUser.last_name,
                        },
                    ];
                    await db.execute(
                        `UPDATE users set friends = ? WHERE user = ?`,
                        [JSON.stringify(friends), ctx.senderId]
                    );
                    await ctx.send('Вы добавили друга в список 📝');
                    await getYoList(ctx);
                }
            }
        });
        await vk.updates.startPolling();
    } catch (e) {
        console.error(e);
    }
}

start();
