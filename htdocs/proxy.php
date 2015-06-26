<?php

$szPostBody = file_get_contents('php://input');
$host = 'giswebservices.massgis.state.ma.us';
$url = 'http://giswebservices.massgis.state.ma.us/geoserver/wfs';
//$url = 'http://www.mapsonline.net/geoserver-2.1.1/wfs';

require_once('Log.php');
$conf = array('lineFormat' => '[%{timestamp}] [%{priority}] [%{ident}] (%{file}:%{line}): %{message}');
$log = &Log::singleton('file', dirname(__FILE__).'/fdc.log', 'MASSGIS', $conf);

$aHeaders = apache_request_headers();
$aHeadersToRemove = array("HOST","CONNECTION");
foreach ($aHeaders as $header => $value) {
	if (array_search(strtoupper($header), $aHeadersToRemove) !== FALSE) {
		unset($aHeaders[$header]);
	}
}
$aHeaders['host'] = $host;

$response = http_parse_message(http_post_data($url,$szPostBody,array("headers" => $aHeaders)));

header("HTTP/1.0 ".$response->responseCode);
header("Access-Control-Allow-Origin: *");

foreach($response->headers as $header => $val) {
	header($header.":".$val);
}
echo $response->body;

?>
