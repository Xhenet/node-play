const opflow = require('@mediagoom/opflow');
const assert = require('assert');//.strict;
const dbg = require('debug')('node-play:opflow-processor');
const EventEmitter = require('events');
const encode_flow = require('./encode').encode;
const axios = require('axios');


function flow_end(flow_id)
{
    dbg('flow-end', flow_id);
    axios.get('http://localhost:4040/drm/video/'+flow_id)
        .catch(error => {
            throw error;
        });
    
}

opflow.on('end', flow_end);


const default_options = {
    processor : {active_operations : 1} 
    , coordinator : { op_batch : 1 }
};


function re_target_flow(operation)
{
    if(undefined !== operation.children)
    {
        operation.children.forEach(element => {
            re_target_flow(element);
        });
    }
    
    if(undefined !== operation.target_type)
    {
        operation.type = operation.target_type;
    }
}


module.exports = class opflow_processor extends EventEmitter {

    constructor(options) {
        
        super();
        
        if(undefined === options)
        {
            options = default_options;
        }

        options = Object.assign({}, default_options, options);

        opflow.configure(options);
        
        const already_running = !(opflow.start());

        dbg('started opflow ', already_running);
   
    }


    async queue_process(file_path, id, destination){

        dbg('queue process %s', file_path);

        const fl = JSON.parse(JSON.stringify(encode_flow));

        fl.root.children[0].config.input_file = file_path;
        fl.root.children[0].config.output_dir = destination;

        fl.root.children[0].config.input_file = fl.root.children[0].config.input_file.replace(/\\\\/g, '/');
        fl.root.children[0].config.input_file = fl.root.children[0].config.input_file.replace(/\\/g, '/');
        fl.root.children[0].config.output_dir = fl.root.children[0].config.output_dir.replace(/\\/g, '/');

        re_target_flow(fl.root);

        //dbg('add flow', JSON.stringify(fl, null, 4));

        const flow_id = await opflow.add_flow(fl);
        
        //check we have not lost the event end 
        //const ended = await opflow.is_flow_completed(this.flow_id);

        dbg('flow started', flow_id);
        
        return flow_id;
    }

    async get_operation_list(flow_id)
    {
        
        const operations = await opflow.get_runtime_flow(flow_id);

        assert(undefined !== operations, 'operations not found ' + flow_id);
        

        operations.sort((a, b) => { return a.modified > b.modified;});

        return operations;
        
        
    }

    async get_status(flow_id)
    {
        try{
            const ended = await opflow.is_flow_completed(flow_id);
        
            if(ended)
                return 'ok';

            const operations = await opflow.get_runtime_flow(flow_id);

            const er = operations.find((op)=> { return op.completed && (!op.succeeded); });

            if(undefined !== er)
                return 'error';

            const working = operations.filter((op)=> { return op.completed && op.succeeded; });
        
            if(undefined !== working && working.length > 0)
                return 'working';

            return 'queued';

        }
        catch(err)
        {
            console.error('cannot retrieve flow id', flow_id, err.message, err.stack);
            return 'error';
        }
    }

    async redo(operation_id)
    {
        return opflow.redo(operation_id);
    }
    
    async stop()
    {
        opflow.stop();
    }

};
