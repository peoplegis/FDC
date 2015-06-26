<?php

require_once('Log.php');
$conf = array('lineFormat' => '[%{timestamp}] [%{priority}] [%{ident}] (%{file}:%{line}): %{message}');
$log = &Log::singleton('file', dirname(__FILE__).'/fdc.log', 'MASSGIS', $conf);

$log->err($_REQUEST);
$contents = file_get_contents("php://input");
$log->err($contents);

sleep(3);

http_response_code(500);
exit();

?>
<response>
	<SUCCESS>
	</SUCCESS>
</response>