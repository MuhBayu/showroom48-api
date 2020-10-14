import { NowRequest, NowResponse } from '@vercel/node';
import request from 'unirest';
import moment from 'moment';
import Promise from 'bluebird';

const groupPerGroup = (list, selected = '') => {
    let groups = ['AKB48', 'HKT48', 'JKT48', 'NGT48', 'NMB48', 'SKE48', 'STU48'];
    let isValid = false;
    selected = selected.toUpperCase();
    if(selected !== '' && groups.includes(selected)) {
        groups = [selected];
        isValid = true;
    }
    const temp = {};
    for (const index in groups) {
        const group = groups[index];
        const filterGroup = list.filter((l) => l.name.search(group) > 0);
        if(filterGroup) temp[group.toUpperCase()] = filterGroup;
    }
    return isValid ? temp[selected] : temp;
}

const profile = (roomId) => {
    return request.get(`https://www.showroom-live.com/api/room/profile?room_id=${roomId}`).then(data => {
        const {
            room_id, room_name, birthday, current_live_started_at, follower_num, genre_name, avatar, 
            award_list, banner_list, is_birthday, is_official, is_onlive, league_label, room_level, main_name
        } = data.body;
        return  {
            room_id, room_name, room_level, league_label, main_name, avatar, award_list,
            birthday, banner_list, current_live_started_at, follower_num, genre_name, is_birthday, is_official, is_onlive
        }
    });
}

const roomList = (query) => {
    const { upcomingLive, liveNow, group, roomId } = query;
    const upcomingFilter = (list) => list.filter(i => i.next_live_schedule !== 0);
    const liveNowFilter = (list) => list.filter(i => i.is_live === true);
    const personFilter = (list, roomId) => list.filter(i => i.id == roomId);

    return request.get('https://campaign.showroom-live.com/akb48_sr/data/room_status_list.json').then(res => {
        let data = res.body;

        if(upcomingLive === "true") data = upcomingFilter(data);
        if(liveNow === "true") data = liveNowFilter(data);
        if(roomId) data = personFilter(data, roomId);

        data = Promise.map(data, async row => {
            const next_live_schedule = row.next_live_schedule;
            row.next_live_schedule = next_live_schedule > 0 ? moment(next_live_schedule * 1000).format('MM/DD h:mm A~') : 0;
            row.next_live_schedule_2 = next_live_schedule > 0 ? moment(next_live_schedule * 1000).format('DD MMMM YYYY, HH:mm') : 0;
            row.images = {
                small: row.image_url.replace('_m.', '_s.'),
                medium: row.image_url,
                large: row.image_url.replace('_m.', '_l.')
            }
            row.url_show = `https://www.showroom-live.com/${row.url_key}`;
            row.ranking = `${process.env.BASE_URL}/api/rooms/ranking?roomId=${row.id}`;
            row.detail = `${process.env.BASE_URL}/api/rooms/?roomId=${row.id}`;
            if(roomId) row.profile = await profile(row.id);
            delete row.image_url;
            return row;
        }).then(data => data.sort((a, b) => {
            const textA = a.name.toUpperCase();
            const textB = b.name.toUpperCase();
            return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
        }));

        if(!roomId) data = groupPerGroup(data, group);

        return (roomId && data.length > 0) ? data[0] : data;
    })
}


export default async function(req: NowRequest, res: NowResponse) {
    try {
        const proto = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers['x-forwarded-host'];
        process.env.BASE_URL = `${proto}://${host}`;

        roomList(req.query).then(data => {
            return res.status(200).json(data);
        })
    } catch (error) {
        return res.status(500).json(error)
    }
}