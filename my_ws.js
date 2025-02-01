my_ws={
	
	socket:0,
	
	child_added:{},
	child_changed:{},
	child_removed:{},
		
	get_resolvers:{},
	get_req_id:0,
	reconnect_time:5000,
	connect_resolver:0,
	sleep:0,
	keep_alive_timer:0,	
	keep_alive_time:45000,
	open_tm:0,
	reconnect_num:0,
	
	s_url:'',
		
	init(){		
		this.s_url=`wss://timewebmtgames.ru:443/${game_name}/`+my_data.uid;
		fbs.ref('WSDEBUG/'+my_data.uid).remove();
		fbs.ref('WSDEBUG/'+my_data.uid).push({tm:Date.now(),event:'init'});
	
		if(this.socket.readyState===1) return;
		return new Promise(resolve=>{
			this.connect_resolver=resolve;
			this.reconnect('init');
		})
	},
	
	send_to_sleep(){	
		
		fbs.ref('WSDEBUG/'+my_data.uid).push({tm:Date.now(),event:'send_to_sleep'});
		
		clearTimeout(this.keep_alive_timer);
		this.sleep=1;	
		this.socket.close(1000, 'sleep');
	},
	
	kill(){
		
		clearTimeout(this.keep_alive_timer);
		this.sleep=1;
		this.socket.close(1000, 'kill');
		
	},
	
	reconnect(reason){
				
		fbs.ref('WSDEBUG/'+my_data.uid).push({tm:Date.now(),event:'reconnect',reason:reason||'noreason'});

		if (this.socket) {
			this.socket.onopen = null;
			this.socket.onmessage = null;
			this.socket.onclose = null;
			this.socket.onerror = null;	
			this.socket.close();
		}
				
		this.open_tm=0;
		this.sleep=0;		
		this.socket = new WebSocket(this.s_url);
				
		this.socket.onopen = () => {
			console.log('Connected to server!');
			this.connect_resolver();
			this.reconnect_time=0;
			this.open_tm=Date.now();
			fbs.ref('WSDEBUG/'+my_data.uid).push({tm:Date.now(),event:'onopen'});
			
			//обновляем подписки
			for (const path in this.child_added)				
				this.socket.send(JSON.stringify({cmd:'child_added',path}))					
			
			this.reset_keep_alive('onopen');
		};			
		
		this.socket.onmessage = event => {
			
			//this.reset_keep_alive('onmessage');
			const msg=JSON.parse(event.data);
			//console.log("Получено от сервера:", msg);
			
			if (msg.event==='child_added')	
				this.child_added[msg.node]?.(msg);
			
			if (msg.event==='get')
				if (this.get_resolvers[msg.req_id])
					this.get_resolvers[msg.req_id](msg.data);

		};
		
		this.socket.onclose = event => {	

			clearTimeout(this.keep_alive_timer)		

			fbs.ref('WSDEBUG/'+my_data.uid).push({tm:Date.now(),event:'close',code:event.code,reason:event.reason,type:event.type||'no_type'});
		
			//не восстанавливаем соединения если закрыто по команде
			if (['not_alive','no_uid','kill','sleep'].includes(event.reason)) return;
					
			if (this.open_tm){
				
				//если продержались онлайн достаточно долго то сбрасываем счетчик
				const tm=Date.now();
				const open_tm_of_socket=tm-this.open_tm;
				if (open_tm_of_socket>180000) this.reconnect_num=0;
						
				this.reconnect_time=10000;
				if (this.reconnect_num>12) this.reconnect_time+=50000;
				if (open_tm_of_socket<this.keep_alive_time)					
					this.keep_alive_time=Math.max(10000,this.keep_alive_time-5000);					
			}else{
				this.reconnect_time=Math.min(60000,Math.floor(this.reconnect_time*1.5));
			}			
			
			this.reconnect_num++;		
			
			console.log(`reconnecting in ${this.reconnect_time*0.001} seconds:`, event);
			setTimeout(()=>{this.reconnect('re')},this.reconnect_time);				
		};

		this.socket.onerror = error => {
			//fbs.ref('WSERRORS/'+my_data.uid).push({tm:Date.now(),event:'error'});
		};
		
	},
	
	reset_keep_alive(reason){
		console.log('reset_keep_alive',reason)
		clearInterval(this.keep_alive_timer)
		this.keep_alive_timer=setTimeout(()=>{
			
			try{
				fbs.ref('WSDEBUG/'+my_data.uid).push({tm:Date.now(),event:'keep_alive'});
				this.socket.send('1');
			}catch(e){
				fbs.ref('WSDEBUG/'+my_data.uid).push({tm:Date.now(),event:'keep_alive_error'});
			}
			
			this.reset_keep_alive('timer');
			
		},this.keep_alive_time);
		
	},
	
	get(path,limit_last){		
		return new Promise(resolve=>{
			
			const req_id=irnd(1,999999);
						
			const timeoutId = setTimeout(() => {
				delete this.get_resolvers[req_id];
				resolve(0);
			}, 5000);			
			
			this.get_resolvers[req_id]=(data)=>{				
				clearTimeout(timeoutId);
				resolve(data);					
			}
			
			/*
			this.get_resolvers[req_id] = {
				resolve: (data) => {
					clearTimeout(timeoutId);
					resolve(data);
				}
			};*/
			
			this.socket.send(JSON.stringify({cmd:'get',path,req_id,limit_last}))				
		
		})	
	},
	
	ss_child_added(path,callback){
		
		this.socket.send(JSON.stringify({cmd:'child_added',path}))	
		this.child_added[path]=callback;
		
	},

	ss_child_changed(path,callback){
		
		this.socket.send(JSON.stringify({cmd:'child_changed',node:path}))	
		this.child_changed[path]=callback;
		
	},
	
	ss_child_removed(path,callback){
		
		this.socket.send(JSON.stringify({cmd:'child_removed',node:path}))	
		this.child_removed[path]=callback;
		
	}	
		
}
