import MihoYoApi from "../model/mys/mihoyo-api.js"
import utils from '../model/mys/utils.js';
import promiseRetry from 'promise-retry';
import {
	Cfg,
	Data
} from "../components/index.js";
import moment from 'moment';
import lodash from 'lodash';
import Common from "../components/Common.js";
import {
	isV3
} from '../components/Changelog.js';
import gsCfg from '../model/gsCfg.js';
import fs from "fs";
import {
	segment
} from "oicq";
import YAML from 'yaml'
import User from "../model/user.js"
export const rule = {
	userInfo: {
		reg: "^#*(ck|stoken|cookie|cookies|签到)查询$",
		describe: "用户个人信息查询"
	},
	gclog: {
		reg: "^#*更新抽卡记录$",
		describe: "更新抽卡记录"
	}
}
const _path = process.cwd();
export async function userInfo(e, {
	render
}) {
	let user = new User(e);
	e.reply("正在获取角色信息请稍等...")
	let sumData = await user.getCkData()
	let week = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
	let day = moment(new Date()).format("yyyy年MM月DD日 HH:mm") + " " + week[new Date().getDay()];
	if (Object.keys(sumData).length == 0) {
		return true;
	}
	let ck = "";
	if (e.cookie) {
		ck = user.getCookieMap(e.cookie);
		ck = ck.get("ltuid")
	}
	return await Common.render(`user/userInfo`, {
		uid: e.user_id,
		ltuid: ck || e.user_id,
		save_id: e.user_id,
		day,
		sumData
	}, {
		e,
		render,
		scale: 1.2
	})
	return true;
}

export async function gclog(e) {
	let user = new User(e);
	await user.cookie(e)
	if(!e.cookies||e.cookies.includes("undefined")){
		e.reply("请先绑定stoken")
		return true;
	}
	let redis_Data = await redis.get(`xiaoyao:gclog:${e.user_id}`);
	if(redis_Data){
		let time=redis_Data*1-Math.floor(Date.now()/1000);
		e.reply(`请求过快,请${time}秒后重试...`);
		return true;
	}
	let miHoYoApi = new MihoYoApi(e);
	let kkbody = await miHoYoApi.getbody("原神");
	const objData = await miHoYoApi.getUserInfo(kkbody)
	let data = objData.data
	e.region = e.uid[0]*1 == 5 ? "cn_qd01" : "cn_gf01"
	let authkeyrow = await miHoYoApi.authkey(data);
	if(!authkeyrow?.data){
		e.reply("authkey获取失败："+authkeyrow.message)
		return true;
	}
	let authkey=authkeyrow.data["authkey"]
	let postdata = {
		'authkey_ver': '1',
		'sign_type': '2',
		'auth_appid': 'webview_gacha',
		'init_type': '301',
		'gacha_id': 'fecafa7b6560db5f3182222395d88aaa6aaac1bc',
		'timestamp': Math.floor(Date.now() / 1000), //当前时间搓
		'lang': 'zh-cn',
		'device_type': 'mobile',
		'plat_type': 'ios',
		'region': e.region, 
		'authkey': encodeURIComponent(authkey),
		'game_biz': 'hk4e_cn',
		'gacha_type': "301",
		'page': 1,
		'size': 5,
		'end_id': 0,
	}
	let url = `https://hk4e-api.mihoyo.com/event/gacha_info/api/getGachaLog?`
	for (let item of Object.keys(postdata)) {
		url += `${item}=${postdata[item]}&`
	}
	e.msg= url.substring(0, url.length - 1);
	if(isV3){
		let gclog= (await import(`file:///${_path}/plugins/genshin/model/gachaLog.js`)).default
		await (new gclog(e)).logUrl()
	} else {
		let {
			bing
		} = (await import(`file:///${_path}/lib/app/gachaLog.js`))
		e.isPrivate = true;
		await bing(e)
	}
	redis.set(`xiaoyao:gclog:${e.user_id}`,  Math.floor(Date.now()/1000)+(60*5), { //把色图链接写入缓存防止一直色色
		EX:  60*5
	});
	return true;
}
